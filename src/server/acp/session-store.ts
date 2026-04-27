import type { NewSessionResponse } from "@agentclientprotocol/sdk";
import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import type { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { streamText } from "ai";
import { array, parse, string } from "valibot";

import {
  chatMessageRoleSchema,
  modeOptionSchema,
  modelOptionSchema,
  rawEventSchema,
  sessionSummarySchema,
  type AgentPreset,
  type ChatMessage,
  type MessageResponse,
  type RawEvent,
  type SendMessageRequest,
  type SessionSummary,
  type UpdateSessionRequest,
} from "../../shared/acp.ts";
import { resolveAttachments } from "../attachments/store.ts";
import { type AppDatabase, getDefaultDatabase } from "../db/sqlite.ts";
import { sessionMessagesTable, sessionsTable } from "../db/schema.ts";
import { buildPromptWithAttachments } from "./prompt-attachments.pure.ts";
import { agentPresets } from "./presets.ts";
import { resolveCommandPath } from "./command-path.ts";
import { normalizeRawEvent } from "./raw-event.pure.ts";
import { enrichModeOptionsIfEmpty, enrichModelOptionsIfEmpty } from "./session-catalog.pure.ts";

const stringifyForRawEvent = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
};

type SessionProvider = Pick<
  ACPProvider,
  "cleanup" | "initSession" | "languageModel" | "setMode" | "setModel" | "tools"
>;

type SessionEntry = {
  provider: SessionProvider;
  session: SessionSummary;
};

type SessionStoreDependencies = {
  readonly database?: AppDatabase;
  readonly createProvider?: (options: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly existingSessionId?: string;
  }) => SessionProvider;
  readonly promptCollector?: (
    provider: SessionProvider,
    prompt: string,
  ) => Promise<{
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
  }>;
  readonly resolveCommand?: typeof resolveCommandPath;
};

const mapModes = (response: NewSessionResponse): SessionSummary["availableModes"] => {
  const availableModes = response.modes?.availableModes ?? [];

  return availableModes.map((mode) => ({
    id: mode.id,
    name: mode.name,
    description: mode.description ?? null,
  }));
};

const mapModels = (response: NewSessionResponse): SessionSummary["availableModels"] => {
  const availableModels = response.models?.availableModels ?? [];

  return availableModels.map((model) => ({
    id: model.modelId,
    name: model.name,
    description: model.description ?? null,
  }));
};

const createSessionSummary = ({
  origin,
  createdAt,
  projectId,
  presetId,
  command,
  args,
  cwd,
  title,
  firstUserMessagePreview = null,
  updatedAt,
  response,
}: {
  readonly origin: SessionSummary["origin"];
  readonly createdAt: string;
  readonly projectId: string | null;
  readonly presetId: string | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly title: string | null;
  readonly firstUserMessagePreview?: string | null;
  readonly updatedAt: string | null;
  readonly response: NewSessionResponse;
}): SessionSummary => {
  const currentModeId = response.modes?.currentModeId ?? null;
  const currentModelId = response.models?.currentModelId ?? null;

  return parse(sessionSummarySchema, {
    sessionId: response.sessionId,
    origin,
    projectId,
    presetId,
    command,
    args: [...args],
    cwd,
    createdAt,
    isActive: true,
    title,
    firstUserMessagePreview: firstUserMessagePreview ?? null,
    updatedAt,
    currentModeId,
    currentModelId,
    availableModes: enrichModeOptionsIfEmpty(mapModes(response), currentModeId),
    availableModels: enrichModelOptionsIfEmpty(mapModels(response), currentModelId),
  });
};

const collectPromptResult = async (
  provider: SessionProvider,
  prompt: string,
): Promise<{
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
}> => {
  const result = streamText({
    includeRawChunks: true,
    model: provider.languageModel(),
    prompt,
    tools: provider.tools,
  });

  let text = "";
  const rawEvents: RawEvent[] = [];
  const reasoningById = new Map<string, string>();

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      continue;
    }

    if (part.type === "reasoning-delta") {
      const previous = reasoningById.get(part.id) ?? "";
      reasoningById.set(part.id, previous + part.text);
      continue;
    }

    if (part.type === "reasoning-end") {
      const merged = reasoningById.get(part.id) ?? "";
      reasoningById.delete(part.id);
      if (merged.length > 0) {
        rawEvents.push({ type: "reasoning", text: merged, rawText: merged });
      }
      continue;
    }

    if (part.type === "tool-call") {
      const input = "input" in part ? (part as { input: unknown }).input : undefined;
      rawEvents.push({
        type: "toolCall",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        inputText: stringifyForRawEvent(input),
        rawText: stringifyForRawEvent({ toolName: part.toolName, input }),
      });
      continue;
    }

    if (part.type === "tool-result" && part.preliminary !== true) {
      rawEvents.push({
        type: "toolResult",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        outputText: stringifyForRawEvent(
          "output" in part ? (part as { output: unknown }).output : undefined,
        ),
        rawText: stringifyForRawEvent(part),
      });
      continue;
    }

    if (part.type === "tool-error") {
      const errorValue = "error" in part ? (part as { error: unknown }).error : undefined;
      rawEvents.push({
        type: "toolError",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        errorText: stringifyForRawEvent(errorValue),
        rawText: stringifyForRawEvent(part),
      });
      continue;
    }

    if (part.type === "raw") {
      const rawEvent = normalizeRawEvent(part.rawValue);
      if (rawEvent !== null) {
        rawEvents.push(rawEvent);
      }
    }
  }

  for (const pendingReasoning of reasoningById.values()) {
    if (pendingReasoning.length > 0) {
      rawEvents.push({
        type: "reasoning",
        text: pendingReasoning,
        rawText: pendingReasoning,
      });
    }
  }

  return { text, rawEvents };
};

const parseStringArray = (input: string): readonly string[] => {
  const data: unknown = JSON.parse(input);
  return parse(array(string()), data);
};

const firstUserMessagePreviewBySessionId = (client: DatabaseSync): ReadonlyMap<string, string> => {
  const statement = client.prepare(`
    SELECT t.session_id AS sessionId, t.text AS text
    FROM session_messages t
    INNER JOIN (
      SELECT session_id, MIN(created_at) AS first_at
      FROM session_messages
      WHERE role = 'user'
      GROUP BY session_id
    ) u ON t.session_id = u.session_id AND t.created_at = u.first_at AND t.role = 'user'
  `);
  const isFirstUserPreviewRow = (row: unknown): row is { sessionId: string; text: string } => {
    if (row === null || typeof row !== "object") {
      return false;
    }
    if (!("sessionId" in row) || !("text" in row)) {
      return false;
    }
    return (
      typeof Reflect.get(row, "sessionId") === "string" &&
      typeof Reflect.get(row, "text") === "string"
    );
  };

  const rawRows: unknown = statement.all();
  const rows: { sessionId: string; text: string }[] = Array.isArray(rawRows)
    ? rawRows.filter(isFirstUserPreviewRow)
    : [];
  return new Map(rows.map((row) => [row.sessionId, row.text]));
};

const mapStoredSession = (
  record: typeof sessionsTable.$inferSelect,
  isActive: boolean,
  firstUserMessagePreview: string | null = null,
): SessionSummary => {
  return parse(sessionSummarySchema, {
    sessionId: record.sessionId,
    origin: record.origin,
    projectId: record.projectId,
    presetId: record.presetId,
    command: record.command,
    args: parseStringArray(record.argsJson),
    cwd: record.cwd,
    createdAt: record.createdAt,
    isActive,
    title: record.title,
    firstUserMessagePreview: firstUserMessagePreview ?? null,
    updatedAt: record.updatedAt,
    currentModeId: record.currentModeId,
    currentModelId: record.currentModelId,
    availableModes: enrichModeOptionsIfEmpty(
      parse(array(modeOptionSchema), JSON.parse(record.availableModesJson)),
      record.currentModeId,
    ),
    availableModels: enrichModelOptionsIfEmpty(
      parse(array(modelOptionSchema), JSON.parse(record.availableModelsJson)),
      record.currentModelId,
    ),
  });
};

export const createSessionStore = ({
  database = getDefaultDatabase(),
  createProvider = ({ command, args, cwd, existingSessionId }) =>
    createACPProvider({
      command,
      args: [...args],
      existingSessionId,
      session: {
        cwd,
        mcpServers: [],
      },
      persistSession: true,
    }),
  promptCollector = collectPromptResult,
  resolveCommand = resolveCommandPath,
}: SessionStoreDependencies = {}) => {
  const runtimeSessions = new Map<string, SessionEntry>();

  const persistSession = async (session: SessionSummary): Promise<void> => {
    await database.db.delete(sessionsTable).where(eq(sessionsTable.sessionId, session.sessionId));
    await database.db.insert(sessionsTable).values({
      sessionId: session.sessionId,
      origin: session.origin,
      projectId: session.projectId,
      presetId: session.presetId,
      command: session.command,
      argsJson: JSON.stringify(session.args),
      cwd: session.cwd,
      createdAt: session.createdAt,
      title: session.title,
      updatedAt: session.updatedAt,
      currentModeId: session.currentModeId,
      currentModelId: session.currentModelId,
      availableModesJson: JSON.stringify(session.availableModes),
      availableModelsJson: JSON.stringify(session.availableModels),
    });
  };

  const getSessionEntry = (sessionId: string): SessionEntry => {
    const entry = runtimeSessions.get(sessionId);
    if (entry === undefined) {
      throw new Error(`Session is not active in this server process: ${sessionId}`);
    }

    return entry;
  };

  const listSessions = async (): Promise<readonly SessionSummary[]> => {
    const records = await database.db.select().from(sessionsTable);
    const firstPreviews = firstUserMessagePreviewBySessionId(database.client);
    return records
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) =>
        mapStoredSession(
          record,
          runtimeSessions.has(record.sessionId),
          firstPreviews.get(record.sessionId) ?? null,
        ),
      );
  };

  const listMessages = async (sessionId: string): Promise<readonly ChatMessage[]> => {
    const records = await database.db
      .select()
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.sessionId, sessionId));
    return records
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => ({
        id: record.id,
        role: parse(chatMessageRoleSchema, record.role),
        text: record.text,
        rawEvents: parse(array(rawEventSchema), JSON.parse(record.rawEventsJson)),
        createdAt: record.createdAt,
      }));
  };

  const persistMessage = async ({
    sessionId,
    message,
  }: {
    readonly sessionId: string;
    readonly message: ChatMessage;
  }): Promise<void> => {
    await database.db.insert(sessionMessagesTable).values({
      id: message.id,
      sessionId,
      role: message.role,
      text: message.text,
      rawEventsJson: JSON.stringify(message.rawEvents),
      createdAt: message.createdAt,
    });
  };

  const buildMessage = ({
    role,
    text,
    rawEvents,
  }: {
    readonly role: ChatMessage["role"];
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
  }): ChatMessage => ({
    id: crypto.randomUUID(),
    role,
    text,
    rawEvents: [...rawEvents],
    createdAt: new Date().toISOString(),
  });

  const createSession = async ({
    projectId,
    preset,
    command,
    args,
    cwd,
    initialModelId,
    initialModeId,
  }: {
    readonly projectId: string | null;
    readonly preset: AgentPreset | null;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly initialModelId?: string | null;
    readonly initialModeId?: string | null;
  }): Promise<SessionSummary> => {
    const resolvedCommandPath = await resolveCommand(command);
    if (resolvedCommandPath === null) {
      throw new Error(
        `Command not found on PATH: ${command}. Install the Codex ACP adapter first.`,
      );
    }

    const provider = createProvider({
      command: resolvedCommandPath,
      args,
      cwd,
    });

    const response = await provider.initSession();
    const createdAt = new Date().toISOString();
    let session = createSessionSummary({
      origin: "new",
      createdAt,
      projectId,
      presetId: preset?.id ?? null,
      command,
      args,
      cwd,
      title: null,
      firstUserMessagePreview: null,
      updatedAt: createdAt,
      response,
    });

    if (initialModeId !== null && initialModeId !== undefined && initialModeId.length > 0) {
      await provider.setMode(initialModeId);
    }
    if (initialModelId !== null && initialModelId !== undefined && initialModelId.length > 0) {
      await provider.setModel(initialModelId);
    }

    if (
      (initialModeId !== null && initialModeId !== undefined && initialModeId.length > 0) ||
      (initialModelId !== null && initialModelId !== undefined && initialModelId.length > 0)
    ) {
      session = parse(sessionSummarySchema, {
        ...session,
        currentModeId:
          initialModeId !== null && initialModeId !== undefined && initialModeId.length > 0
            ? initialModeId
            : session.currentModeId,
        currentModelId:
          initialModelId !== null && initialModelId !== undefined && initialModelId.length > 0
            ? initialModelId
            : session.currentModelId,
      });
    }

    runtimeSessions.set(session.sessionId, {
      provider,
      session,
    });
    await persistSession(session);

    return session;
  };

  const loadSession = async ({
    projectId,
    preset,
    command,
    args,
    cwd,
    sessionId,
    title,
    updatedAt,
  }: {
    readonly projectId: string | null;
    readonly preset: AgentPreset;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly sessionId: string;
    readonly title: string | null;
    readonly updatedAt: string | null;
  }): Promise<SessionSummary> => {
    const activeEntry = runtimeSessions.get(sessionId);
    if (activeEntry !== undefined) {
      return activeEntry.session;
    }

    const resolvedCommandPath = await resolveCommand(command);
    if (resolvedCommandPath === null) {
      throw new Error(
        `Command not found on PATH: ${command}. Install the Codex ACP adapter first.`,
      );
    }

    const provider = createProvider({
      command: resolvedCommandPath,
      args,
      cwd,
      existingSessionId: sessionId,
    });
    const response = await provider.initSession();
    const createdAt = new Date().toISOString();
    const session = createSessionSummary({
      origin: "loaded",
      createdAt,
      projectId,
      presetId: preset.id,
      command,
      args,
      cwd,
      title,
      firstUserMessagePreview: null,
      updatedAt: updatedAt ?? createdAt,
      response: {
        ...response,
        sessionId,
      },
    });

    runtimeSessions.set(session.sessionId, {
      provider,
      session,
    });
    await persistSession(session);

    return session;
  };

  const resolveAgentPreset = (presetId: string | null | undefined): AgentPreset => {
    const id = presetId ?? "codex";
    const fallback = agentPresets[0];
    if (fallback === undefined) {
      throw new Error("agentPresets must not be empty");
    }
    return agentPresets.find((preset) => preset.id === id) ?? fallback;
  };

  const ensureSessionEntry = async (sessionId: string): Promise<SessionEntry> => {
    const inMemory = runtimeSessions.get(sessionId);
    if (inMemory !== undefined) {
      return inMemory;
    }

    const [record] = await database.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .limit(1);
    if (record === undefined) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const preset = resolveAgentPreset(record.presetId);
    await loadSession({
      projectId: record.projectId,
      preset,
      command: record.command,
      args: parseStringArray(record.argsJson),
      cwd: record.cwd,
      sessionId: record.sessionId,
      title: record.title,
      updatedAt: record.updatedAt,
    });

    const entry = getSessionEntry(sessionId);
    const fromDb = mapStoredSession(record, true, null);

    if (
      fromDb.currentModelId !== null &&
      fromDb.currentModelId !== undefined &&
      fromDb.currentModelId.length > 0
    ) {
      await entry.provider.setModel(fromDb.currentModelId);
    }
    if (
      fromDb.currentModeId !== null &&
      fromDb.currentModeId !== undefined &&
      fromDb.currentModeId.length > 0
    ) {
      await entry.provider.setMode(fromDb.currentModeId);
    }
    entry.session = parse(sessionSummarySchema, {
      ...entry.session,
      currentModelId: fromDb.currentModelId,
      currentModeId: fromDb.currentModeId,
    });
    await persistSession(entry.session);

    return entry;
  };

  const updateSession = async (
    sessionId: string,
    request: UpdateSessionRequest,
  ): Promise<SessionSummary> => {
    const entry = getSessionEntry(sessionId);

    if (request.modeId !== null && request.modeId !== undefined) {
      await entry.provider.setMode(request.modeId);
    }

    if (request.modelId !== null && request.modelId !== undefined) {
      await entry.provider.setModel(request.modelId);
    }

    const session = parse(sessionSummarySchema, {
      ...entry.session,
      isActive: true,
      updatedAt: new Date().toISOString(),
      currentModeId: request.modeId ?? entry.session.currentModeId,
      currentModelId: request.modelId ?? entry.session.currentModelId,
    });
    entry.session = session;
    await persistSession(session);

    return session;
  };

  const sendPrompt = async (
    sessionId: string,
    request: SendMessageRequest,
  ): Promise<MessageResponse> => {
    const entry = await ensureSessionEntry(sessionId);
    const attachments = resolveAttachments(request.attachmentIds ?? []);
    const effectivePrompt = buildPromptWithAttachments({
      attachments,
      prompt: request.prompt,
    });

    if (request.modelId !== null && request.modelId !== undefined && request.modelId.length > 0) {
      await entry.provider.setModel(request.modelId);
    }
    if (request.modeId !== null && request.modeId !== undefined && request.modeId.length > 0) {
      await entry.provider.setMode(request.modeId);
    }
    if (request.modelId !== undefined || request.modeId !== undefined) {
      entry.session = parse(sessionSummarySchema, {
        ...entry.session,
        isActive: true,
        updatedAt: new Date().toISOString(),
        currentModelId: request.modelId ?? entry.session.currentModelId,
        currentModeId: request.modeId ?? entry.session.currentModeId,
      });
      await persistSession(entry.session);
    }

    await persistMessage({
      sessionId,
      message: buildMessage({ role: "user", text: effectivePrompt, rawEvents: [] }),
    });

    try {
      const result = await promptCollector(entry.provider, effectivePrompt);

      await persistMessage({
        sessionId,
        message: buildMessage({
          role: "assistant",
          text: result.text,
          rawEvents: result.rawEvents,
        }),
      });

      return {
        session: entry.session,
        text: result.text,
        rawEvents: [...result.rawEvents],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to collect prompt result";
      await persistMessage({
        sessionId,
        message: buildMessage({
          role: "assistant",
          text: `Error: ${message}`,
          rawEvents: [],
        }),
      });
      throw error;
    }
  };

  const removeSession = async (sessionId: string): Promise<boolean> => {
    const existingSessions = await database.db
      .select({ sessionId: sessionsTable.sessionId })
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .limit(1);

    const entry = runtimeSessions.get(sessionId);
    if (entry !== undefined) {
      entry.provider.cleanup();
      runtimeSessions.delete(sessionId);
    }

    if (existingSessions.length === 0) {
      return false;
    }

    await database.db.delete(sessionsTable).where(eq(sessionsTable.sessionId, sessionId));
    return true;
  };

  return {
    listSessions,
    listMessages,
    createSession,
    loadSession,
    updateSession,
    sendPrompt,
    removeSession,
  };
};

let defaultSessionStore: ReturnType<typeof createSessionStore> | undefined = undefined;

const getSessionStore = () => {
  defaultSessionStore ??= createSessionStore();
  return defaultSessionStore;
};

export const listSessions = async (): Promise<readonly SessionSummary[]> => {
  return getSessionStore().listSessions();
};

export const listSessionMessages = async (sessionId: string): Promise<readonly ChatMessage[]> => {
  return getSessionStore().listMessages(sessionId);
};

export const createSession = async (options: {
  readonly projectId: string | null;
  readonly preset: AgentPreset | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly initialModelId?: string | null;
  readonly initialModeId?: string | null;
}): Promise<SessionSummary> => {
  return getSessionStore().createSession(options);
};

export const loadSession = async (options: {
  readonly projectId: string | null;
  readonly preset: AgentPreset;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly sessionId: string;
  readonly title: string | null;
  readonly updatedAt: string | null;
}): Promise<SessionSummary> => {
  return getSessionStore().loadSession(options);
};

export const updateSession = async (
  sessionId: string,
  request: UpdateSessionRequest,
): Promise<SessionSummary> => {
  return getSessionStore().updateSession(sessionId, request);
};

export const sendPrompt = async (
  sessionId: string,
  request: SendMessageRequest,
): Promise<MessageResponse> => {
  return getSessionStore().sendPrompt(sessionId, request);
};

export const removeSession = async (sessionId: string): Promise<boolean> => {
  return getSessionStore().removeSession(sessionId);
};
