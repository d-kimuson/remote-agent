import { streamText } from "ai";
import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import type { NewSessionResponse } from "@agentclientprotocol/sdk";

import type {
  AgentPreset,
  MessageResponse,
  RawEvent,
  SessionSummary,
  UpdateSessionRequest,
} from "../../shared/acp.ts";
import { resolveCommandPath } from "./command-path.ts";
import { normalizeRawEvent } from "./raw-event.pure.ts";

type SessionEntry = {
  readonly createdAt: string;
  readonly projectId: string | null;
  readonly presetId: string | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  provider: ACPProvider;
  session: SessionSummary;
};

const sessionStore = new Map<string, SessionEntry>();

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
  createdAt,
  projectId,
  presetId,
  command,
  args,
  cwd,
  response,
}: {
  readonly createdAt: string;
  readonly projectId: string | null;
  readonly presetId: string | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly response: NewSessionResponse;
}): SessionSummary => {
  return {
    sessionId: response.sessionId,
    projectId,
    presetId,
    command,
    args: [...args],
    cwd,
    createdAt,
    currentModeId: response.modes?.currentModeId ?? null,
    currentModelId: response.models?.currentModelId ?? null,
    availableModes: mapModes(response),
    availableModels: mapModels(response),
  };
};

export const listSessions = (): readonly SessionSummary[] => {
  return [...sessionStore.values()].map((entry) => entry.session);
};

export const createSession = async ({
  projectId,
  preset,
  command,
  args,
  cwd,
}: {
  readonly projectId: string | null;
  readonly preset: AgentPreset | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}): Promise<SessionSummary> => {
  const resolvedCommandPath = await resolveCommandPath(command);
  if (resolvedCommandPath === null) {
    throw new Error(
      `Command not found on PATH: ${command}. Install the adapter or use a custom command.`,
    );
  }

  const provider = createACPProvider({
    command: resolvedCommandPath,
    args: [...args],
    session: {
      cwd,
      mcpServers: [],
    },
    persistSession: true,
  });

  const response = await provider.initSession();
  const createdAt = new Date().toISOString();
  const session = createSessionSummary({
    createdAt,
    projectId,
    presetId: preset?.id ?? null,
    command,
    args,
    cwd,
    response,
  });

  sessionStore.set(session.sessionId, {
    createdAt,
    projectId,
    presetId: preset?.id ?? null,
    command,
    args,
    cwd,
    provider,
    session,
  });

  return session;
};

const getSessionEntry = (sessionId: string): SessionEntry => {
  const entry = sessionStore.get(sessionId);
  if (entry === undefined) {
    throw new Error(`Unknown session: ${sessionId}`);
  }

  return entry;
};

export const updateSession = async (
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

  const session = {
    ...entry.session,
    currentModeId: request.modeId ?? entry.session.currentModeId,
    currentModelId: request.modelId ?? entry.session.currentModelId,
  };
  entry.session = session;

  return session;
};

const collectPromptResult = async (
  provider: ACPProvider,
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

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      continue;
    }

    if (part.type === "raw") {
      const rawEvent = normalizeRawEvent(part.rawValue);
      if (rawEvent !== null) {
        rawEvents.push(rawEvent);
      }
    }
  }

  return { text, rawEvents };
};

export const sendPrompt = async (sessionId: string, prompt: string): Promise<MessageResponse> => {
  const entry = getSessionEntry(sessionId);
  const result = await collectPromptResult(entry.provider, prompt);

  return {
    session: entry.session,
    text: result.text,
    rawEvents: [...result.rawEvents],
  };
};

export const removeSession = (sessionId: string): boolean => {
  const entry = sessionStore.get(sessionId);
  if (entry === undefined) {
    return false;
  }

  entry.provider.cleanup();
  return sessionStore.delete(sessionId);
};
