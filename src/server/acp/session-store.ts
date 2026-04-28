import type { NewSessionResponse } from "@agentclientprotocol/sdk";
import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import type { DatabaseSync } from "node:sqlite";
import { and, eq } from "drizzle-orm";
import type { ToolSet } from "ai";
import { array, parse, string } from "valibot";

import {
  chatMessageKindSchema,
  chatMessageRoleSchema,
  modeOptionSchema,
  modelOptionSchema,
  rawEventSchema,
  sessionOriginSchema,
  sessionSummarySchema,
  type AgentPreset,
  type ChatMessage,
  type ChatMessageKind,
  type MessageResponse,
  type RawEvent,
  type SendMessageRequest,
  type SessionSummary,
  type SessionStatus,
  type UpdateSessionRequest,
} from "../../shared/acp.ts";
import {
  collectPromptStream,
  type PromptStreamInsertRow,
  type PromptStreamPersistence,
} from "./collect-prompt-stream.ts";
import { resolveAttachments } from "../attachments/store.ts";
import { type AppDatabase, getDefaultDatabase } from "../db/sqlite.ts";
import { sessionMessagesTable, sessionsTable } from "../db/schema.ts";
import { buildPromptWithAttachments } from "./prompt-attachments.pure.ts";
import { agentPresets } from "./presets.ts";
import { resolveCommandPath } from "./command-path.ts";
import { emitAcpSse } from "./sse-broadcast.ts";
import {
  buildModelOptionsFromResponse,
  buildModeOptionsFromResponse,
} from "./session-acp-response.pure.ts";
import {
  enrichModeOptionsIfEmpty,
  enrichModelOptionsIfEmpty,
  preferNonEmptyModeCatalog,
  preferNonEmptyModelCatalog,
} from "./session-catalog.pure.ts";

type SessionProvider = Pick<
  ACPProvider,
  "cleanup" | "initSession" | "languageModel" | "setMode" | "setModel" | "tools"
>;

/**
 * `acp-ai-provider` の `startSession` は、未接続のツール用 MCP を後から付与すると
 * `if (this.sessionId && toolsAdded) { this.connection.newSession(...) }` で
 * 既存の ACP セッション（`loadSession` 済みを含む）を捨てて新規セッションに置き換える。
 * 初回 `initSession` から `streamText` と同じ `tools` を渡し、1 本目の `startSession` で
 * プロキシ付き mcp をセッションに乗せる（node_modules/@mcpc-tech/acp-ai-provider/index.mjs 参照）。
 */
const initAcpProviderSession = async (provider: SessionProvider): Promise<NewSessionResponse> => {
  /** `ACPProvider.get tools` は `this.model` 未生成だと常に undefined（@mcpc-tech/acp-ai-provider） */
  provider.languageModel();
  const tools = (provider.tools ?? {}) as NonNullable<Parameters<ACPProvider["initSession"]>[0]>;
  return await provider.initSession(tools);
};

type SessionEntry = {
  provider: SessionProvider;
  runningPromptCount: number;
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
  /** 省略時は `collectPromptStream` で全パーツを永続化。テスト用に差し替え可。 */
  readonly promptCollector?: (
    provider: SessionProvider,
    prompt: string,
  ) => Promise<{
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
    readonly alreadyPersisted: boolean;
    readonly assistantSegmentMessages: readonly ChatMessage[];
  }>;
  readonly resolveCommand?: typeof resolveCommandPath;
};

const createSessionSummary = ({
  origin,
  status,
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
  readonly status: SessionStatus;
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
  const modelInfo = buildModelOptionsFromResponse(response);
  const modeInfo = buildModeOptionsFromResponse(response);
  const currentModelId = modelInfo.currentModelId;
  const currentModeId = modeInfo.currentModeId;

  return parse(sessionSummarySchema, {
    sessionId: response.sessionId,
    origin,
    status,
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
    availableModes: enrichModeOptionsIfEmpty(modeInfo.options, currentModeId),
    availableModels: enrichModelOptionsIfEmpty(modelInfo.options, currentModelId),
  });
};

const mapMessageKindFromDb = (value: string | null | undefined): ChatMessageKind => {
  if (value === null || value === undefined || value.length === 0) {
    return "legacy_assistant_turn";
  }
  return parse(chatMessageKindSchema, value);
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
  status: SessionStatus,
  firstUserMessagePreview: string | null = null,
): SessionSummary => {
  return parse(sessionSummarySchema, {
    sessionId: record.sessionId,
    origin: record.origin,
    status,
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
  promptCollector,
  resolveCommand = resolveCommandPath,
}: SessionStoreDependencies = {}) => {
  const runtimeSessions = new Map<string, SessionEntry>();

  const emitSessionUpdated = (session: SessionSummary): void => {
    emitAcpSse({
      type: "session_updated",
      sessionId: session.sessionId,
      status: session.status,
    });
  };

  const persistSession = async (session: SessionSummary): Promise<void> => {
    // DELETE+INSERT だと session_messages が CASCADE で全消去されるため upsert にする。
    await database.db
      .insert(sessionsTable)
      .values({
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
      })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set: {
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
        },
      });
    emitSessionUpdated(session);
  };

  const getSessionEntry = (sessionId: string): SessionEntry => {
    const entry = runtimeSessions.get(sessionId);
    if (entry === undefined) {
      throw new Error(`Session is not active in this server process: ${sessionId}`);
    }

    return entry;
  };

  const sessionStatusFromEntry = (entry: SessionEntry | undefined): SessionStatus => {
    if (entry === undefined) {
      return "inactive";
    }
    return entry.runningPromptCount > 0 ? "running" : "paused";
  };

  const setSessionStatus = (entry: SessionEntry, status: SessionStatus): void => {
    entry.session = parse(sessionSummarySchema, {
      ...entry.session,
      status,
      isActive: true,
    });
  };

  const listSessions = async (): Promise<readonly SessionSummary[]> => {
    const records = await database.db.select().from(sessionsTable);
    const firstPreviews = firstUserMessagePreviewBySessionId(database.client);
    return records
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => {
        const entry = runtimeSessions.get(record.sessionId);
        return mapStoredSession(
          record,
          entry !== undefined,
          sessionStatusFromEntry(entry),
          firstPreviews.get(record.sessionId) ?? null,
        );
      });
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
        kind:
          record.role === "user"
            ? "user"
            : mapMessageKindFromDb(record.messageKind as string | null | undefined),
        text: record.text,
        rawEvents: parse(array(rawEventSchema), JSON.parse(record.rawEventsJson)),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        streamPartId: record.streamPartId,
        metadataJson: record.metadataJson,
      }));
  };

  const persistMessage = async ({
    sessionId,
    message,
  }: {
    readonly sessionId: string;
    readonly message: ChatMessage;
  }): Promise<void> => {
    const created = message.createdAt;
    const updated = message.updatedAt ?? created;
    const kind: ChatMessageKind =
      message.kind ?? (message.role === "user" ? "user" : "legacy_assistant_turn");
    await database.db.insert(sessionMessagesTable).values({
      id: message.id,
      sessionId,
      role: message.role,
      text: message.text,
      rawEventsJson: JSON.stringify(message.rawEvents),
      createdAt: created,
      messageKind: kind,
      streamPartId: message.streamPartId ?? null,
      metadataJson: message.metadataJson ?? "{}",
      updatedAt: updated,
    });
    emitAcpSse({ type: "session_messages_updated", sessionId });
  };

  const buildMessage = ({
    role,
    text,
    rawEvents,
    kind,
    streamPartId = null,
    metadataJson = "{}",
  }: {
    readonly role: ChatMessage["role"];
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
    readonly kind?: ChatMessageKind;
    readonly streamPartId?: string | null;
    readonly metadataJson?: string;
  }): ChatMessage => {
    const t = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      role,
      kind: kind ?? (role === "user" ? "user" : "legacy_assistant_turn"),
      text,
      rawEvents: [...rawEvents],
      createdAt: t,
      updatedAt: t,
      streamPartId,
      metadataJson: metadataJson === "{}" ? undefined : metadataJson,
    };
  };

  const toChatMessageFromStreamRow = (row: PromptStreamInsertRow): ChatMessage => ({
    id: row.id,
    role: row.role,
    kind: row.messageKind,
    text: row.text,
    rawEvents: [...row.rawEvents],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    streamPartId: row.streamPartId,
    metadataJson: row.metadataJson,
  });

  const streamPersistence: PromptStreamPersistence = {
    insert: async (row) => {
      await persistMessage({ sessionId: row.sessionId, message: toChatMessageFromStreamRow(row) });
    },
    updateByStreamPartId: async (input) => {
      await database.db
        .update(sessionMessagesTable)
        .set({
          text: input.text,
          rawEventsJson: JSON.stringify([...input.rawEvents]),
          metadataJson: input.metadataJson,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(sessionMessagesTable.sessionId, input.sessionId),
            eq(sessionMessagesTable.streamPartId, input.streamPartId),
          ),
        );
      emitAcpSse({ type: "session_messages_updated", sessionId: input.sessionId });
    },
  };

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

    const response = await initAcpProviderSession(provider);
    const createdAt = new Date().toISOString();
    let session = createSessionSummary({
      origin: "new",
      status: "paused",
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
    const hasInitialModelTuning =
      initialModelId !== null && initialModelId !== undefined && initialModelId.length > 0;
    if (hasInitialModelTuning) {
      await provider.setModel(initialModelId);
    }

    if (
      (initialModeId !== null && initialModeId !== undefined && initialModeId.length > 0) ||
      hasInitialModelTuning
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
      runningPromptCount: 0,
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

    const [existingRow] = await database.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .limit(1);

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
    const response = await initAcpProviderSession(provider);
    const createdAt = existingRow?.createdAt ?? new Date().toISOString();
    const origin =
      existingRow !== undefined ? parse(sessionOriginSchema, existingRow.origin) : "loaded";
    const effectiveUpdatedAt = updatedAt ?? existingRow?.updatedAt ?? null;
    const session = createSessionSummary({
      origin,
      status: "paused",
      createdAt,
      projectId,
      presetId: preset.id,
      command,
      args,
      cwd,
      title,
      firstUserMessagePreview: null,
      updatedAt: effectiveUpdatedAt ?? createdAt,
      response: {
        ...response,
        sessionId,
      },
    });

    if (session.sessionId !== sessionId) {
      throw new Error(
        `loadSession: internal bug — summary sessionId (${session.sessionId}) !== requested (${sessionId})`,
      );
    }

    runtimeSessions.set(session.sessionId, {
      provider,
      runningPromptCount: 0,
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
    const fromDb = mapStoredSession(record, true, "paused", null);

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
    const currentModelId = fromDb.currentModelId ?? entry.session.currentModelId;
    const currentModeId = fromDb.currentModeId ?? entry.session.currentModeId;
    const availableModels = enrichModelOptionsIfEmpty(
      preferNonEmptyModelCatalog(entry.session.availableModels, fromDb.availableModels),
      currentModelId,
    );
    const availableModes = enrichModeOptionsIfEmpty(
      preferNonEmptyModeCatalog(entry.session.availableModes, fromDb.availableModes),
      currentModeId,
    );
    entry.session = parse(sessionSummarySchema, {
      ...entry.session,
      status: sessionStatusFromEntry(entry),
      currentModelId,
      currentModeId,
      availableModels,
      availableModes,
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
      status: sessionStatusFromEntry(entry),
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

    if (request.modeId !== null && request.modeId !== undefined && request.modeId.length > 0) {
      await entry.provider.setMode(request.modeId);
    }
    if (request.modelId !== null && request.modelId !== undefined && request.modelId.length > 0) {
      await entry.provider.setModel(request.modelId);
    }
    if (request.modelId !== undefined || request.modeId !== undefined) {
      entry.session = parse(sessionSummarySchema, {
        ...entry.session,
        isActive: true,
        status: sessionStatusFromEntry(entry),
        updatedAt: new Date().toISOString(),
        currentModelId: request.modelId ?? entry.session.currentModelId,
        currentModeId: request.modeId ?? entry.session.currentModeId,
      });
      await persistSession(entry.session);
    }

    await persistMessage({
      sessionId,
      message: buildMessage({ role: "user", text: effectivePrompt, rawEvents: [], kind: "user" }),
    });

    const collectPromptResponse = async (): Promise<
      Pick<MessageResponse, "assistantSegmentMessages" | "rawEvents" | "text">
    > => {
      if (promptCollector === undefined) {
        const streamed = await collectPromptStream({
          provider: {
            languageModel: () => entry.provider.languageModel(),
            tools: (entry.provider.tools ?? {}) as ToolSet,
          },
          prompt: effectivePrompt,
          sessionId,
          now: () => new Date().toISOString(),
          persistence: streamPersistence,
        });

        return {
          text: streamed.text,
          rawEvents: [...streamed.rawEvents],
          assistantSegmentMessages: [...streamed.assistantSegmentMessages],
        };
      }

      const result = await promptCollector(entry.provider, effectivePrompt);
      if (result.alreadyPersisted) {
        return {
          text: result.text,
          rawEvents: [...result.rawEvents],
          assistantSegmentMessages: [...result.assistantSegmentMessages],
        };
      }

      const segments =
        result.assistantSegmentMessages.length > 0
          ? [...result.assistantSegmentMessages]
          : [
              buildMessage({
                role: "assistant",
                text: result.text,
                rawEvents: result.rawEvents,
                kind: "legacy_assistant_turn",
              }),
            ];
      for (const msg of segments) {
        await persistMessage({ sessionId, message: msg });
      }

      return {
        text: result.text,
        rawEvents: [...result.rawEvents],
        assistantSegmentMessages: segments,
      };
    };

    entry.runningPromptCount += 1;
    setSessionStatus(entry, sessionStatusFromEntry(entry));
    emitSessionUpdated(entry.session);

    let result: Pick<MessageResponse, "assistantSegmentMessages" | "rawEvents" | "text"> | null =
      null;
    try {
      result = await collectPromptResponse();
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to collect prompt result";
      await persistMessage({
        sessionId,
        message: buildMessage({
          role: "assistant",
          text: `Error: ${message}`,
          rawEvents: [],
          kind: "legacy_assistant_turn",
        }),
      });
      throw error;
    } finally {
      entry.runningPromptCount = Math.max(0, entry.runningPromptCount - 1);
      setSessionStatus(entry, sessionStatusFromEntry(entry));
      emitSessionUpdated(entry.session);
    }

    if (result === null) {
      throw new Error("failed to collect prompt result");
    }

    return {
      session: entry.session,
      text: result.text,
      rawEvents: result.rawEvents,
      assistantSegmentMessages: result.assistantSegmentMessages,
    };
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
    emitAcpSse({ type: "session_removed", sessionId });
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
