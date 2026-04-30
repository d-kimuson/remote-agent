import type {
  NewSessionResponse,
  SessionNotification,
  SetSessionConfigOptionResponse,
} from '@agentclientprotocol/sdk';
import type { ModelMessage, UserModelMessage } from 'ai';

import { createACPProvider, type ACPProvider } from '@mcpc-tech/acp-ai-provider';
import { and, asc, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { array, parse, string } from 'valibot';

import {
  chatMessageRawEventsFromRaw,
  chatMessageRawKind,
  chatMessageRoleFromRaw,
  chatMessageTextFromRaw,
  chatMessageKindSchema,
  modeOptionSchema,
  modelOptionSchema,
  parsePersistedMessageRaw,
  sessionConfigOptionSchema,
  sessionOriginSchema,
  sessionSummarySchema,
  type AgentPreset,
  type ChatMessage,
  type ChatMessageKind,
  type MessageResponse,
  type ModeOption,
  type ModelOption,
  type PersistedMessageRaw,
  type RawEvent,
  type SendMessageRequest,
  type SessionSummary,
  type SessionStatus,
  type UserAttachment,
  type UpdateSessionConfigOptionRequest,
  type UpdateSessionRequest,
} from '../../../shared/acp.ts';
import { resolveAttachments, resolveUploadedAttachments } from '../../attachments/store.ts';
import {
  agentProviderCatalogsTable,
  sessionMessagesTable,
  sessionsTable,
} from '../../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../../db/sqlite.ts';
import { agentPresets } from '../presets.ts';
import {
  acpAiProviderAttachmentCapabilities,
  buildAttachmentPromptPlan,
  type AttachmentPromptPlan,
} from '../prompt-attachments.pure.ts';
import { resolveProviderAuthMethodId } from '../provider-auth-method.pure.ts';
import {
  buildGenericConfigOptionsFromResponse,
  buildModelOptionsFromResponse,
  buildModeOptionsFromResponse,
} from '../session-acp-response.pure.ts';
import {
  enrichModeOptionsIfEmpty,
  enrichModelOptionsIfEmpty,
  preferNonEmptyModeCatalog,
  preferNonEmptyModelCatalog,
} from '../session-catalog.pure.ts';
import { installAcpProviderToolResultPatch } from './acp-provider-tool-result-patch.ts';
import { buildAgentLaunchCommand } from './agent-launch-command.pure.ts';
import { buildAgentProcessEnv } from './agent-process-env.ts';
import { importProviderSessionMessages } from './codex-session-log.ts';
import {
  collectPromptStream,
  type PromptStreamInsertRow,
  type PromptStreamPersistence,
} from './collect-prompt-stream.ts';
import { resolveCommandPath } from './command-path.ts';
import {
  cancelPermissionRequestsForSession,
  requestUserPermission,
} from './permission-request-store.ts';
import { emitAcpSse } from './sse-broadcast.ts';

type SessionProvider = Pick<
  ACPProvider,
  'cleanup' | 'initSession' | 'languageModel' | 'setMode' | 'setModel' | 'tools'
>;

type PermissionRequestClient = {
  readonly setPermissionRequestHandler: (handler: typeof requestUserPermission) => void;
};

type SessionUpdateHandler = (params: SessionNotification) => void;

type SessionUpdateClient = {
  setSessionUpdateHandler: (handler: SessionUpdateHandler) => void;
};

type SessionConfigOptionClient = {
  readonly setSessionConfigOption: (input: {
    readonly sessionId: string;
    readonly configId: string;
    readonly value: string;
  }) => Promise<SetSessionConfigOptionResponse>;
};

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
  const tools = (provider.tools ?? {}) as NonNullable<Parameters<ACPProvider['initSession']>[0]>;
  const response = await provider.initSession(tools);
  installProviderPermissionHandler(provider);
  return response;
};

const hasSetPermissionRequestHandler = (value: unknown): value is PermissionRequestClient => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return typeof Reflect.get(value, 'setPermissionRequestHandler') === 'function';
};

const resolvePermissionRequestClient = (
  provider: SessionProvider,
): PermissionRequestClient | null => {
  const directClient: unknown = Reflect.get(provider, 'client');
  if (hasSetPermissionRequestHandler(directClient)) {
    return directClient;
  }

  const model: unknown = Reflect.get(provider, 'model');
  if (model === undefined) {
    return null;
  }
  const modelClient: unknown =
    model !== null && typeof model === 'object' ? Reflect.get(model, 'client') : undefined;
  if (hasSetPermissionRequestHandler(modelClient)) {
    return modelClient;
  }

  throw new Error('ACP provider does not support permission request handling');
};

const installProviderPermissionHandler = (provider: SessionProvider): void => {
  const client = resolvePermissionRequestClient(provider);
  if (client === null) {
    return;
  }
  client.setPermissionRequestHandler(requestUserPermission);
};

const attachmentPromptMessagesFromPlan = async (
  plan: AttachmentPromptPlan,
): Promise<readonly ModelMessage[] | undefined> => {
  const imageDeliveries = plan.deliveries.filter((delivery) => delivery.kind === 'image');
  if (imageDeliveries.length === 0) {
    return undefined;
  }

  const content: UserModelMessage['content'] = [
    {
      type: 'text',
      text: plan.promptText,
    },
  ];

  for (const delivery of imageDeliveries) {
    content.push({
      type: 'file',
      data: await readFile(delivery.storedPath),
      filename: delivery.name,
      mediaType: delivery.mediaType,
    });
  }

  return [
    {
      role: 'user',
      content,
    },
  ];
};

const userAttachmentsFromPromptPlan = (plan: AttachmentPromptPlan): readonly UserAttachment[] => {
  return plan.deliveries.reduce<readonly UserAttachment[]>((items, delivery) => {
    if (delivery.kind !== 'image' || delivery.source === undefined) {
      return items;
    }

    return [
      ...items,
      {
        type: 'image',
        source: delivery.source,
        attachmentId: delivery.attachmentId,
        name: delivery.name,
        sizeInBytes: delivery.sizeInBytes,
      },
    ];
  }, []);
};

const hasSetSessionUpdateHandler = (value: unknown): value is SessionUpdateClient => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return typeof Reflect.get(value, 'setSessionUpdateHandler') === 'function';
};

const resolveSessionUpdateClient = (provider: SessionProvider): SessionUpdateClient | null => {
  const directClient: unknown = Reflect.get(provider, 'client');
  if (hasSetSessionUpdateHandler(directClient)) {
    return directClient;
  }

  const model: unknown = Reflect.get(provider, 'model');
  if (model === undefined) {
    return null;
  }
  const modelClient: unknown =
    model !== null && typeof model === 'object' ? Reflect.get(model, 'client') : undefined;
  return hasSetSessionUpdateHandler(modelClient) ? modelClient : null;
};

const installProviderSessionUpdateTap = (
  provider: SessionProvider,
  onSessionUpdate: (params: SessionNotification) => Promise<void>,
): void => {
  const client = resolveSessionUpdateClient(provider);
  if (client === null) {
    return;
  }

  const originalSetSessionUpdateHandler = client.setSessionUpdateHandler.bind(client);
  client.setSessionUpdateHandler = (handler) => {
    originalSetSessionUpdateHandler((params) => {
      void onSessionUpdate(params);
      handler(params);
    });
  };
};

const hasSetSessionConfigOption = (value: unknown): value is SessionConfigOptionClient => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return typeof Reflect.get(value, 'setSessionConfigOption') === 'function';
};

const providerModelObject = (provider: SessionProvider): object | null => {
  const model: unknown = Reflect.get(provider, 'model');
  return model !== null && typeof model === 'object' ? model : null;
};

const providerSessionId = (provider: SessionProvider): string | null => {
  const model = providerModelObject(provider);
  const fromModel: unknown = model === null ? null : Reflect.get(model, 'sessionId');
  if (typeof fromModel === 'string' && fromModel.length > 0) {
    return fromModel;
  }

  const getSessionId: unknown = Reflect.get(provider, 'getSessionId');
  if (typeof getSessionId !== 'function') {
    return null;
  }
  const value: unknown = Reflect.apply(getSessionId, provider, []);
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const resolveSessionConfigOptionClient = (
  provider: SessionProvider,
): SessionConfigOptionClient | null => {
  const directConnection: unknown = Reflect.get(provider, 'connection');
  if (hasSetSessionConfigOption(directConnection)) {
    return directConnection;
  }

  const model = providerModelObject(provider);
  const modelConnection: unknown = model === null ? null : Reflect.get(model, 'connection');
  return hasSetSessionConfigOption(modelConnection) ? modelConnection : null;
};

type SessionEntry = {
  activePromptControllers: Set<AbortController>;
  provider: SessionProvider;
  runningPromptCount: number;
  session: SessionSummary;
};

type SessionStoreDependencies = {
  readonly database?: AppDatabase;
  readonly createProvider?: (options: {
    readonly command: string;
    readonly args: readonly string[];
    readonly authMethodId?: string;
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly existingSessionId?: string;
  }) => SessionProvider;
  /** 省略時は `collectPromptStream` で全パーツを永続化。テスト用に差し替え可。 */
  readonly promptCollector?: (
    provider: SessionProvider,
    prompt: string,
    options: { readonly abortSignal: AbortSignal },
  ) => Promise<{
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
    readonly alreadyPersisted: boolean;
    readonly assistantSegmentMessages: readonly ChatMessage[];
  }>;
  readonly resolveCommand?: typeof resolveCommandPath;
  readonly importProviderMessages?: (
    presetId: string,
    sessionId: string,
  ) => Promise<readonly ChatMessage[]>;
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
  readonly origin: SessionSummary['origin'];
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
  const configOptions = buildGenericConfigOptionsFromResponse(response);
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
    configOptions,
  });
};

const mapMessageKindFromDb = (value: string | null | undefined): ChatMessageKind => {
  if (value === null || value === undefined || value.length === 0) {
    return 'legacy_assistant_turn';
  }
  return parse(chatMessageKindSchema, value);
};

const messageKindSortRank = (kind: string): number => (kind === 'user' ? 0 : 1);

const messageFromRaw = ({
  id,
  kind,
  rawJson,
  textForSearch,
  createdAt,
}: {
  readonly id: string;
  readonly kind: ChatMessageKind;
  readonly rawJson: PersistedMessageRaw;
  readonly textForSearch: string;
  readonly createdAt: string;
}): ChatMessage => ({
  id,
  role: chatMessageRoleFromRaw(rawJson),
  kind,
  rawJson,
  textForSearch,
  text: chatMessageTextFromRaw(rawJson),
  rawEvents: [...chatMessageRawEventsFromRaw(rawJson)],
  createdAt,
  streamPartId:
    rawJson.type === 'assistant_text' ||
    rawJson.type === 'reasoning' ||
    rawJson.type === 'tool_input'
      ? rawJson.streamPartId
      : null,
});

const xErrorMessageFromRow = (row: {
  readonly id: string;
  readonly kind: string;
  readonly rawJson: string;
  readonly createdAt: string;
  readonly textForSearch: string;
}): ChatMessage => {
  const rawJson: PersistedMessageRaw = {
    schemaVersion: 1,
    type: 'x-error',
    role: 'assistant',
    sourceKind: row.kind,
    errorMessage: 'Invalid raw_json for session message',
    rawJsonText: row.rawJson.slice(0, 10_000),
    issues: [{ message: 'raw_json validation failed or kind mismatch' }],
    createdAt: row.createdAt,
  };
  return messageFromRaw({
    id: row.id,
    kind: 'x-error',
    rawJson,
    textForSearch: row.textForSearch,
    createdAt: row.createdAt,
  });
};

const assistantRawJsonFromBuiltMessage = ({
  kind,
  text,
  rawEvents,
  metadataJson,
  createdAt,
}: {
  readonly kind: ChatMessageKind;
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly metadataJson: string;
  readonly createdAt: string;
}): PersistedMessageRaw => {
  switch (kind) {
    case 'legacy_assistant_turn':
      return {
        schemaVersion: 1,
        type: 'legacy_assistant_turn',
        role: 'assistant',
        text,
        rawEvents: [...rawEvents],
        metadata: metadataJson === '{}' ? undefined : JSON.parse(metadataJson),
        createdAt,
      };
    case 'raw_meta':
      return {
        schemaVersion: 1,
        type: 'raw_meta',
        role: 'assistant',
        text,
        part: metadataJson === '{}' ? rawEvents : JSON.parse(metadataJson),
        createdAt,
      };
    case 'abort':
    case 'stream_error':
    case 'stream_start':
    case 'stream_finish':
    case 'step_start':
    case 'step_finish':
    case 'source':
    case 'file':
    case 'tool_output_denied':
    case 'tool_approval_request':
      return {
        schemaVersion: 1,
        type: kind,
        role: 'assistant',
        part: metadataJson === '{}' ? { text, rawEvents } : JSON.parse(metadataJson),
        text,
        createdAt,
      };
    case 'assistant_text':
    case 'reasoning':
    case 'tool_input':
    case 'tool_call':
    case 'tool_result':
    case 'tool_error':
    case 'user':
    case 'x-error':
      return {
        schemaVersion: 1,
        type: 'legacy_assistant_turn',
        role: 'assistant',
        text,
        rawEvents: [...rawEvents],
        metadata: metadataJson === '{}' ? undefined : JSON.parse(metadataJson),
        createdAt,
      };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
};

const parseStringArray = (input: string): readonly string[] => {
  const data: unknown = JSON.parse(input);
  return parse(array(string()), data);
};

const firstUserMessagePreviewBySessionId = (
  rows: readonly { readonly sessionId: string; readonly text: string }[],
): ReadonlyMap<string, string> => {
  return rows.reduce<Map<string, string>>((previews, row) => {
    if (!previews.has(row.sessionId)) {
      previews.set(row.sessionId, row.text);
    }
    return previews;
  }, new Map());
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
    configOptions: parse(array(sessionConfigOptionSchema), JSON.parse(record.configOptionsJson)),
  });
};

const providerCatalogKey = ({
  cwd,
  presetId,
}: {
  readonly presetId: string;
  readonly cwd: string;
}): string => `${presetId}\0${cwd}`;

const resolveAcpSessionCancel = (
  provider: SessionProvider,
  sessionId: string,
): (() => Promise<void>) | null => {
  provider.languageModel();
  const modelValue: unknown = Reflect.get(provider, 'model');
  if (modelValue === null || typeof modelValue !== 'object') {
    return null;
  }
  const connectionValue: unknown = Reflect.get(modelValue, 'connection');
  if (connectionValue === null || typeof connectionValue !== 'object') {
    return null;
  }
  const cancelValue: unknown = Reflect.get(connectionValue, 'cancel');
  if (typeof cancelValue !== 'function') {
    return null;
  }
  return async () => {
    await Reflect.apply(cancelValue, connectionValue, [{ sessionId }]);
  };
};

const isAbortLikeError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AbortError' ||
    error.message.toLowerCase().includes('abort') ||
    error.message.toLowerCase().includes('cancel'));

export const createSessionStore = ({
  database = getDefaultDatabase(),
  createProvider = ({ command, args, authMethodId, cwd, env, existingSessionId }) =>
    createACPProvider({
      command,
      args: [...args],
      authMethodId,
      env: env ?? buildAgentProcessEnv(),
      existingSessionId,
      session: {
        cwd,
        mcpServers: [],
      },
      persistSession: true,
    }),
  promptCollector,
  resolveCommand = resolveCommandPath,
  importProviderMessages = importProviderSessionMessages,
}: SessionStoreDependencies = {}) => {
  installAcpProviderToolResultPatch();

  const runtimeSessions = new Map<string, SessionEntry>();

  const emitSessionUpdated = (session: SessionSummary): void => {
    emitAcpSse({
      type: 'session_updated',
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
        configOptionsJson: JSON.stringify(session.configOptions),
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
          configOptionsJson: JSON.stringify(session.configOptions),
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
      return 'inactive';
    }
    return entry.runningPromptCount > 0 ? 'running' : 'paused';
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
    const catalogRecords = await database.db.select().from(agentProviderCatalogsTable);
    const firstUserMessageRecords = await database.db
      .select({
        sessionId: sessionMessagesTable.sessionId,
        text: sessionMessagesTable.textForSearch,
      })
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.kind, 'user'))
      .orderBy(asc(sessionMessagesTable.sessionId), asc(sessionMessagesTable.createdAt));
    const catalogsByPresetAndCwd = new Map(
      catalogRecords.map((record) => [
        providerCatalogKey({ presetId: record.presetId, cwd: record.cwd }),
        {
          availableModes: parse(array(modeOptionSchema), JSON.parse(record.availableModesJson)),
          availableModels: parse(array(modelOptionSchema), JSON.parse(record.availableModelsJson)),
          currentModeId: record.currentModeId,
          currentModelId: record.currentModelId,
        },
      ]),
    );
    const firstPreviews = firstUserMessagePreviewBySessionId(firstUserMessageRecords);
    return records
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => {
        const entry = runtimeSessions.get(record.sessionId);
        const session = mapStoredSession(
          record,
          entry !== undefined,
          sessionStatusFromEntry(entry),
          firstPreviews.get(record.sessionId) ?? null,
        );
        if (record.presetId === null) {
          return session;
        }
        const catalog = catalogsByPresetAndCwd.get(
          providerCatalogKey({ presetId: record.presetId, cwd: record.cwd }),
        );
        if (catalog === undefined) {
          return session;
        }
        const currentModelId = session.currentModelId ?? catalog.currentModelId;
        const currentModeId = session.currentModeId ?? catalog.currentModeId;
        return parse(sessionSummarySchema, {
          ...session,
          currentModelId,
          currentModeId,
          availableModels: enrichModelOptionsIfEmpty(
            preferNonEmptyModelCatalog(session.availableModels, catalog.availableModels),
            currentModelId,
          ),
          availableModes: enrichModeOptionsIfEmpty(
            preferNonEmptyModeCatalog(session.availableModes, catalog.availableModes),
            currentModeId,
          ),
        });
      });
  };

  const listMessages = async (sessionId: string): Promise<readonly ChatMessage[]> => {
    const selectMessages = async () =>
      await database.db
        .select()
        .from(sessionMessagesTable)
        .where(eq(sessionMessagesTable.sessionId, sessionId));

    let records = await selectMessages();
    if (records.length === 0) {
      const [record] = await database.db
        .select({ presetId: sessionsTable.presetId })
        .from(sessionsTable)
        .where(eq(sessionsTable.sessionId, sessionId))
        .limit(1);
      if (record?.presetId !== null && record?.presetId !== undefined) {
        await importProviderMessagesIfEmpty({
          presetId: record.presetId,
          sessionId,
        });
        records = await selectMessages();
      }
    }

    return records
      .sort((left, right) => {
        const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
        if (createdAtOrder !== 0) {
          return createdAtOrder;
        }
        const kindOrder = messageKindSortRank(left.kind) - messageKindSortRank(right.kind);
        return kindOrder !== 0 ? kindOrder : left.id.localeCompare(right.id);
      })
      .map((record) => {
        const parsedJson = (() => {
          try {
            return parsePersistedMessageRaw(JSON.parse(record.rawJson));
          } catch {
            return null;
          }
        })();
        if (parsedJson === null || !parsedJson.success) {
          return xErrorMessageFromRow(record);
        }
        const kind = mapMessageKindFromDb(record.kind);
        if (chatMessageRawKind(parsedJson.output) !== kind) {
          return xErrorMessageFromRow(record);
        }
        return messageFromRaw({
          id: record.id,
          kind,
          rawJson: parsedJson.output,
          textForSearch: record.textForSearch,
          createdAt: record.createdAt,
        });
      });
  };

  const persistMessage = async ({
    sessionId,
    message,
  }: {
    readonly sessionId: string;
    readonly message: ChatMessage;
  }): Promise<void> => {
    const created = message.createdAt;
    const kind: ChatMessageKind =
      message.kind ?? (message.role === 'user' ? 'user' : 'legacy_assistant_turn');
    await database.db.insert(sessionMessagesTable).values({
      id: message.id,
      sessionId,
      kind,
      textForSearch: message.textForSearch ?? message.text,
      rawJson: JSON.stringify(message.rawJson),
      createdAt: created,
    });
    emitAcpSse({ type: 'session_messages_updated', sessionId });
  };

  const hasStoredMessages = async (sessionId: string): Promise<boolean> => {
    const rows = await database.db
      .select({ id: sessionMessagesTable.id })
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.sessionId, sessionId))
      .limit(1);

    return rows.length > 0;
  };

  const importProviderMessagesIfEmpty = async ({
    presetId,
    sessionId,
  }: {
    readonly presetId: string;
    readonly sessionId: string;
  }): Promise<void> => {
    if (await hasStoredMessages(sessionId)) {
      return;
    }

    const messages = await importProviderMessages(presetId, sessionId);
    for (const message of messages) {
      await persistMessage({ sessionId, message });
    }
  };

  const buildMessage = ({
    role,
    text,
    rawEvents,
    kind,
    streamPartId = null,
    metadataJson = '{}',
    attachments = [],
  }: {
    readonly role: ChatMessage['role'];
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
    readonly kind?: ChatMessageKind;
    readonly streamPartId?: string | null;
    readonly metadataJson?: string;
    readonly attachments?: readonly UserAttachment[];
  }): ChatMessage => {
    const t = new Date().toISOString();
    const resolvedKind = kind ?? (role === 'user' ? 'user' : 'legacy_assistant_turn');
    const rawJson: PersistedMessageRaw =
      role === 'user'
        ? {
            schemaVersion: 1,
            type: 'user',
            role: 'user',
            text,
            attachments: [...attachments],
            createdAt: t,
          }
        : resolvedKind === 'legacy_assistant_turn'
          ? assistantRawJsonFromBuiltMessage({
              kind: resolvedKind,
              text,
              rawEvents,
              metadataJson,
              createdAt: t,
            })
          : assistantRawJsonFromBuiltMessage({
              kind: resolvedKind,
              text,
              rawEvents,
              metadataJson,
              createdAt: t,
            });
    return {
      id: crypto.randomUUID(),
      role,
      kind: resolvedKind,
      rawJson,
      textForSearch: text,
      text,
      rawEvents: [...rawEvents],
      createdAt: t,
      updatedAt: t,
      streamPartId,
      metadataJson: metadataJson === '{}' ? undefined : metadataJson,
    };
  };

  const sessionUpdateText = (notification: SessionNotification): string => {
    const { update } = notification;
    if (update.sessionUpdate === 'available_commands_update') {
      return update.availableCommands.map((command) => `/${command.name}`).join(', ');
    }
    if (update.sessionUpdate === 'usage_update') {
      const percent =
        update.size === 0 ? 0 : Math.round((Math.max(0, update.used) / update.size) * 100);
      return `context ${String(update.used)}/${String(update.size)} tokens (${String(percent)}%)`;
    }
    if (update.sessionUpdate === 'session_info_update') {
      return JSON.stringify({
        title: update.title,
        updatedAt: update.updatedAt,
      });
    }
    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      return JSON.stringify({
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status,
        locations: update.locations,
      });
    }
    return JSON.stringify(update);
  };

  const persistSessionUpdateMessage = async (notification: SessionNotification): Promise<void> => {
    const updateType = notification.update.sessionUpdate;
    if (
      updateType !== 'session_info_update' &&
      updateType !== 'usage_update' &&
      updateType !== 'available_commands_update' &&
      updateType !== 'tool_call' &&
      updateType !== 'tool_call_update'
    ) {
      return;
    }

    const rawText = JSON.stringify(notification.update);
    await persistMessage({
      sessionId: notification.sessionId,
      message: buildMessage({
        role: 'assistant',
        text: sessionUpdateText(notification),
        rawEvents: [
          {
            type: 'streamPart',
            partType: updateType,
            text: sessionUpdateText(notification),
            rawText,
          },
        ],
        kind: 'raw_meta',
        metadataJson: JSON.stringify({ acpSessionUpdate: notification.update }),
      }),
    });
  };

  const handleObservedSessionUpdate = async (
    expectedSessionId: string,
    notification: SessionNotification,
  ): Promise<void> => {
    if (notification.sessionId !== expectedSessionId) {
      return;
    }

    if (notification.update.sessionUpdate === 'session_info_update') {
      const entry = runtimeSessions.get(expectedSessionId);
      if (entry !== undefined) {
        entry.session = parse(sessionSummarySchema, {
          ...entry.session,
          title: Object.hasOwn(notification.update, 'title')
            ? notification.update.title
            : entry.session.title,
          updatedAt: Object.hasOwn(notification.update, 'updatedAt')
            ? notification.update.updatedAt
            : entry.session.updatedAt,
          status: sessionStatusFromEntry(entry),
          isActive: true,
        });
        await persistSession(entry.session);
      }
    }

    if (notification.update.sessionUpdate === 'config_option_update') {
      const entry = runtimeSessions.get(expectedSessionId);
      if (entry !== undefined) {
        entry.session = parse(sessionSummarySchema, {
          ...entry.session,
          configOptions: buildGenericConfigOptionsFromResponse({
            configOptions: notification.update.configOptions,
          }),
          status: sessionStatusFromEntry(entry),
          isActive: true,
        });
        await persistSession(entry.session);
      }
    }

    await persistSessionUpdateMessage(notification);
  };

  const toChatMessageFromStreamRow = (row: PromptStreamInsertRow): ChatMessage => ({
    id: row.id,
    role: row.role,
    kind: row.messageKind,
    rawJson: row.rawJson,
    textForSearch: row.textForSearch,
    text: chatMessageTextFromRaw(row.rawJson),
    rawEvents: [...chatMessageRawEventsFromRaw(row.rawJson)],
    createdAt: row.createdAt,
    streamPartId: row.streamPartId,
  });

  const streamPersistence: PromptStreamPersistence = {
    insert: async (row) => {
      await persistMessage({ sessionId: row.sessionId, message: toChatMessageFromStreamRow(row) });
    },
    updateByStreamPartId: async (input) => {
      await database.db
        .update(sessionMessagesTable)
        .set({
          textForSearch: input.textForSearch,
          rawJson: JSON.stringify(input.rawJson),
        })
        .where(
          and(
            eq(sessionMessagesTable.sessionId, input.sessionId),
            eq(sessionMessagesTable.id, input.streamPartId),
          ),
        );
      if (input.notify !== 'none') {
        emitAcpSse({ type: 'session_messages_updated', sessionId: input.sessionId });
      }
    },
  };

  const createSession = async ({
    persistInitial = true,
    projectId,
    preset,
    command,
    args,
    cwd,
    initialModelId,
    initialModeId,
  }: {
    readonly persistInitial?: boolean;
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
        `Command not found on PATH: ${command}. Install the selected ACP provider first.`,
      );
    }

    const launch = buildAgentLaunchCommand({
      providerCommand: resolvedCommandPath,
      providerArgs: args,
      cwd,
      env: buildAgentProcessEnv(),
    });
    const provider = createProvider({
      command: launch.command,
      args: launch.args,
      authMethodId: resolveProviderAuthMethodId(preset),
      cwd: launch.cwd,
      env: launch.env,
    });
    const response = await initAcpProviderSession(provider);
    installProviderSessionUpdateTap(provider, (notification) =>
      handleObservedSessionUpdate(response.sessionId, notification),
    );
    const createdAt = new Date().toISOString();
    let session = createSessionSummary({
      origin: 'new',
      status: 'paused',
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
      activePromptControllers: new Set(),
      provider,
      runningPromptCount: 0,
      session,
    });
    if (persistInitial) {
      await persistSession(session);
    }

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
        `Command not found on PATH: ${command}. Install the selected ACP provider first.`,
      );
    }

    const launch = buildAgentLaunchCommand({
      providerCommand: resolvedCommandPath,
      providerArgs: args,
      cwd,
      env: buildAgentProcessEnv(),
    });
    const provider = createProvider({
      command: launch.command,
      args: launch.args,
      authMethodId: resolveProviderAuthMethodId(preset),
      cwd: launch.cwd,
      env: launch.env,
      existingSessionId: sessionId,
    });
    const response = await initAcpProviderSession(provider);
    installProviderSessionUpdateTap(provider, (notification) =>
      handleObservedSessionUpdate(response.sessionId, notification),
    );
    const createdAt = existingRow?.createdAt ?? new Date().toISOString();
    const origin =
      existingRow !== undefined ? parse(sessionOriginSchema, existingRow.origin) : 'loaded';
    const effectiveUpdatedAt = updatedAt ?? existingRow?.updatedAt ?? null;
    const session = createSessionSummary({
      origin,
      status: 'paused',
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
    const storedSession =
      existingRow === undefined ? null : mapStoredSession(existingRow, true, 'paused', null);

    if (session.sessionId !== sessionId) {
      throw new Error(
        `loadSession: internal bug — summary sessionId (${session.sessionId}) !== requested (${sessionId})`,
      );
    }

    const currentModelId = storedSession?.currentModelId ?? session.currentModelId;
    const currentModeId = storedSession?.currentModeId ?? session.currentModeId;
    if (currentModelId !== null && currentModelId !== undefined && currentModelId.length > 0) {
      await provider.setModel(currentModelId);
    }
    if (currentModeId !== null && currentModeId !== undefined && currentModeId.length > 0) {
      await provider.setMode(currentModeId);
    }
    const restoredSession = parse(sessionSummarySchema, {
      ...session,
      currentModelId,
      currentModeId,
      availableModels: enrichModelOptionsIfEmpty(
        preferNonEmptyModelCatalog(session.availableModels, storedSession?.availableModels ?? []),
        currentModelId,
      ),
      availableModes: enrichModeOptionsIfEmpty(
        preferNonEmptyModeCatalog(session.availableModes, storedSession?.availableModes ?? []),
        currentModeId,
      ),
    });

    runtimeSessions.set(restoredSession.sessionId, {
      activePromptControllers: new Set(),
      provider,
      runningPromptCount: 0,
      session: restoredSession,
    });
    await persistSession(restoredSession);
    await importProviderMessagesIfEmpty({
      presetId: preset.id,
      sessionId: restoredSession.sessionId,
    });

    return restoredSession;
  };

  const importSession = async ({
    projectId,
    preset,
    command,
    args,
    cwd,
    sessionId,
    title,
    updatedAt,
    availableModes,
    availableModels,
    currentModeId,
    currentModelId,
  }: {
    readonly projectId: string | null;
    readonly preset: AgentPreset;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly sessionId: string;
    readonly title: string | null;
    readonly updatedAt: string | null;
    readonly availableModes: readonly ModeOption[];
    readonly availableModels: readonly ModelOption[];
    readonly currentModeId: string | null;
    readonly currentModelId: string | null;
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
    const storedSession =
      existingRow === undefined ? null : mapStoredSession(existingRow, false, 'inactive', null);
    const createdAt = existingRow?.createdAt ?? new Date().toISOString();
    const origin =
      existingRow !== undefined ? parse(sessionOriginSchema, existingRow.origin) : 'loaded';
    const effectiveCurrentModeId = storedSession?.currentModeId ?? currentModeId;
    const effectiveCurrentModelId = storedSession?.currentModelId ?? currentModelId;
    const importedSession = parse(sessionSummarySchema, {
      sessionId,
      origin,
      status: 'inactive',
      projectId,
      presetId: preset.id,
      command,
      args: [...args],
      cwd,
      createdAt,
      isActive: false,
      title: title ?? existingRow?.title ?? null,
      firstUserMessagePreview: null,
      updatedAt: updatedAt ?? existingRow?.updatedAt ?? createdAt,
      currentModeId: effectiveCurrentModeId,
      currentModelId: effectiveCurrentModelId,
      availableModes: enrichModeOptionsIfEmpty(
        preferNonEmptyModeCatalog([...availableModes], storedSession?.availableModes ?? []),
        effectiveCurrentModeId,
      ),
      availableModels: enrichModelOptionsIfEmpty(
        preferNonEmptyModelCatalog([...availableModels], storedSession?.availableModels ?? []),
        effectiveCurrentModelId,
      ),
      configOptions: storedSession?.configOptions ?? [],
    });

    await persistSession(importedSession);
    await importProviderMessagesIfEmpty({
      presetId: preset.id,
      sessionId: importedSession.sessionId,
    });
    return importedSession;
  };

  const resolveAgentPreset = (presetId: string | null | undefined): AgentPreset => {
    const id = presetId ?? 'codex';
    const fallback = agentPresets[0];
    if (fallback === undefined) {
      throw new Error('agentPresets must not be empty');
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
    const fromDb = mapStoredSession(record, true, 'paused', null);

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

  const updateSessionConfigOption = async (
    sessionId: string,
    request: UpdateSessionConfigOptionRequest,
  ): Promise<SessionSummary> => {
    const entry = getSessionEntry(sessionId);
    const client = resolveSessionConfigOptionClient(entry.provider);
    const providerSessionIdValue = providerSessionId(entry.provider) ?? sessionId;

    if (client === null) {
      throw new Error(
        'ACP provider adapter does not expose session/set_config_option for this session.',
      );
    }

    const response = await client.setSessionConfigOption({
      sessionId: providerSessionIdValue,
      configId: request.configId,
      value: request.value,
    });
    const configOptions = buildGenericConfigOptionsFromResponse({
      configOptions: response.configOptions,
    });

    const session = parse(sessionSummarySchema, {
      ...entry.session,
      isActive: true,
      status: sessionStatusFromEntry(entry),
      updatedAt: new Date().toISOString(),
      configOptions,
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
    const attachments =
      request.attachments === undefined
        ? resolveAttachments(request.attachmentIds ?? [])
        : resolveUploadedAttachments(request.attachments);
    const attachmentPromptPlan = buildAttachmentPromptPlan({
      attachments,
      capabilities: acpAiProviderAttachmentCapabilities,
      prompt: request.prompt,
    });
    const effectivePrompt = attachmentPromptPlan.promptText;
    const promptMessages = await attachmentPromptMessagesFromPlan(attachmentPromptPlan);
    const userAttachments = userAttachmentsFromPromptPlan(attachmentPromptPlan);

    await persistSession(entry.session);
    await persistMessage({
      sessionId,
      message: buildMessage({
        role: 'user',
        text: request.prompt,
        rawEvents: [],
        kind: 'user',
        attachments: userAttachments,
      }),
    });

    try {
      if (request.modeId !== null && request.modeId !== undefined && request.modeId.length > 0) {
        await entry.provider.setMode(request.modeId);
      }
      if (request.modelId !== null && request.modelId !== undefined && request.modelId.length > 0) {
        await entry.provider.setModel(request.modelId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to apply session settings';
      await persistMessage({
        sessionId,
        message: buildMessage({
          role: 'assistant',
          text: `Error: ${message}`,
          rawEvents: [],
          kind: 'legacy_assistant_turn',
        }),
      });
      throw error;
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

    const abortController = new AbortController();

    const collectPromptResponse = async (): Promise<
      Pick<MessageResponse, 'assistantSegmentMessages' | 'rawEvents' | 'text'>
    > => {
      if (promptCollector === undefined) {
        const streamed = await collectPromptStream({
          abortSignal: abortController.signal,
          provider: {
            languageModel: () => entry.provider.languageModel(),
            tools: entry.provider.tools ?? {},
          },
          prompt: effectivePrompt,
          promptMessages,
          sessionId,
          now: () => new Date().toISOString(),
          persistence: streamPersistence,
          onTextDelta: ({ sessionId: deltaSessionId, message, delta }) => {
            if (message.streamPartId === null || message.streamPartId === undefined) {
              return;
            }
            emitAcpSse({
              type: 'session_text_delta',
              sessionId: deltaSessionId,
              messageId: message.id,
              streamPartId: message.streamPartId,
              delta,
              text: message.text,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt ?? message.createdAt,
              metadataJson: message.metadataJson,
            });
          },
          onReasoningDelta: ({ sessionId: deltaSessionId, message, delta }) => {
            if (message.streamPartId === null || message.streamPartId === undefined) {
              return;
            }
            emitAcpSse({
              type: 'session_reasoning_delta',
              sessionId: deltaSessionId,
              messageId: message.id,
              streamPartId: message.streamPartId,
              delta,
              text: message.text,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt ?? message.createdAt,
              metadataJson: message.metadataJson,
            });
          },
        });

        return {
          text: streamed.text,
          rawEvents: [...streamed.rawEvents],
          assistantSegmentMessages: [...streamed.assistantSegmentMessages],
        };
      }

      const result = await promptCollector(entry.provider, effectivePrompt, {
        abortSignal: abortController.signal,
      });
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
                role: 'assistant',
                text: result.text,
                rawEvents: result.rawEvents,
                kind: 'legacy_assistant_turn',
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

    entry.activePromptControllers.add(abortController);
    entry.runningPromptCount += 1;
    setSessionStatus(entry, sessionStatusFromEntry(entry));
    emitSessionUpdated(entry.session);

    let result: Pick<MessageResponse, 'assistantSegmentMessages' | 'rawEvents' | 'text'> | null =
      null;
    try {
      result = await collectPromptResponse();
    } catch (error) {
      if (abortController.signal.aborted || isAbortLikeError(error)) {
        await persistMessage({
          sessionId,
          message: buildMessage({
            role: 'assistant',
            text: 'Cancelled',
            rawEvents: [
              {
                type: 'streamPart',
                partType: 'abort',
                text: 'Cancelled',
                rawText: 'Cancelled',
              },
            ],
            kind: 'abort',
            metadataJson: JSON.stringify({
              stopReason: 'cancelled',
              reason:
                abortController.signal.reason === undefined
                  ? null
                  : String(abortController.signal.reason),
            }),
          }),
        });
        result = {
          text: '',
          rawEvents: [
            {
              type: 'streamPart',
              partType: 'abort',
              text: 'Cancelled',
              rawText: 'Cancelled',
            },
          ],
          assistantSegmentMessages: [],
        };
        return {
          session: entry.session,
          text: result.text,
          rawEvents: result.rawEvents,
          assistantSegmentMessages: result.assistantSegmentMessages,
        };
      }
      const message = error instanceof Error ? error.message : 'failed to collect prompt result';
      await persistMessage({
        sessionId,
        message: buildMessage({
          role: 'assistant',
          text: `Error: ${message}`,
          rawEvents: [],
          kind: 'legacy_assistant_turn',
        }),
      });
      throw error;
    } finally {
      entry.activePromptControllers.delete(abortController);
      entry.runningPromptCount = Math.max(0, entry.runningPromptCount - 1);
      setSessionStatus(entry, sessionStatusFromEntry(entry));
      emitSessionUpdated(entry.session);
    }

    if (result === null) {
      throw new Error('failed to collect prompt result');
    }

    return {
      session: entry.session,
      text: result.text,
      rawEvents: result.rawEvents,
      assistantSegmentMessages: result.assistantSegmentMessages,
    };
  };

  const cancelSession = async (sessionId: string): Promise<SessionSummary> => {
    const entry = getSessionEntry(sessionId);
    const hadRunningPrompt = entry.runningPromptCount > 0 || entry.activePromptControllers.size > 0;

    cancelPermissionRequestsForSession(sessionId);

    const notifyAcpCancel = resolveAcpSessionCancel(entry.provider, sessionId);
    const notifyAcpCancelPromise =
      notifyAcpCancel === null ? Promise.resolve() : notifyAcpCancel().catch(() => undefined);
    void notifyAcpCancelPromise;

    for (const controller of entry.activePromptControllers) {
      controller.abort('cancelled');
    }
    entry.activePromptControllers.clear();
    entry.runningPromptCount = 0;
    setSessionStatus(entry, sessionStatusFromEntry(entry));
    await persistSession(entry.session);

    return parse(sessionSummarySchema, {
      ...entry.session,
      status: hadRunningPrompt ? 'paused' : entry.session.status,
      isActive: true,
    });
  };

  const stopSession = async (sessionId: string): Promise<SessionSummary> => {
    const entry = getSessionEntry(sessionId);
    if (entry.runningPromptCount > 0 || entry.activePromptControllers.size > 0) {
      throw new Error('Cannot stop a running session. Cancel it first.');
    }

    cancelPermissionRequestsForSession(sessionId);
    await Promise.resolve(entry.provider.cleanup());
    runtimeSessions.delete(sessionId);

    const stoppedSession = parse(sessionSummarySchema, {
      ...entry.session,
      status: 'inactive',
      isActive: false,
    });
    emitSessionUpdated(stoppedSession);
    return stoppedSession;
  };

  const removeSession = async (sessionId: string): Promise<boolean> => {
    const existingSessions = await database.db
      .select({ sessionId: sessionsTable.sessionId })
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .limit(1);

    const entry = runtimeSessions.get(sessionId);
    if (entry !== undefined) {
      cancelPermissionRequestsForSession(sessionId);
      entry.provider.cleanup();
      runtimeSessions.delete(sessionId);
    }

    if (existingSessions.length === 0) {
      return false;
    }

    await database.db.delete(sessionsTable).where(eq(sessionsTable.sessionId, sessionId));
    emitAcpSse({ type: 'session_removed', sessionId });
    return true;
  };

  return {
    listSessions,
    listMessages,
    createSession,
    loadSession,
    importSession,
    updateSession,
    updateSessionConfigOption,
    sendPrompt,
    cancelSession,
    stopSession,
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
  readonly persistInitial?: boolean;
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

export const createPreparedSession = async (options: {
  readonly projectId: string | null;
  readonly preset: AgentPreset | null;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly initialModelId?: string | null;
  readonly initialModeId?: string | null;
}): Promise<SessionSummary> => {
  return getSessionStore().createSession({ ...options, persistInitial: false });
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

export const importSession = async (options: {
  readonly projectId: string | null;
  readonly preset: AgentPreset;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly sessionId: string;
  readonly title: string | null;
  readonly updatedAt: string | null;
  readonly availableModes: readonly ModeOption[];
  readonly availableModels: readonly ModelOption[];
  readonly currentModeId: string | null;
  readonly currentModelId: string | null;
}): Promise<SessionSummary> => {
  return getSessionStore().importSession(options);
};

export const updateSession = async (
  sessionId: string,
  request: UpdateSessionRequest,
): Promise<SessionSummary> => {
  return getSessionStore().updateSession(sessionId, request);
};

export const updateSessionConfigOption = async (
  sessionId: string,
  request: UpdateSessionConfigOptionRequest,
): Promise<SessionSummary> => {
  return getSessionStore().updateSessionConfigOption(sessionId, request);
};

export const sendPrompt = async (
  sessionId: string,
  request: SendMessageRequest,
): Promise<MessageResponse> => {
  return getSessionStore().sendPrompt(sessionId, request);
};

export const cancelSession = async (sessionId: string): Promise<SessionSummary> => {
  return getSessionStore().cancelSession(sessionId);
};

export const stopSession = async (sessionId: string): Promise<SessionSummary> => {
  return getSessionStore().stopSession(sessionId);
};

export const removeSession = async (sessionId: string): Promise<boolean> => {
  return getSessionStore().removeSession(sessionId);
};
