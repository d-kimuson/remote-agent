import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  parse,
  pipe,
  string,
  trim,
  union,
  type InferOutput,
} from 'valibot';

export const agentPresetSchema = object({
  id: pipe(string(), trim()),
  label: pipe(string(), trim()),
  description: pipe(string(), trim()),
  command: pipe(string(), trim()),
  args: array(pipe(string(), trim())),
  modelSelectLabel: optional(pipe(string(), trim())),
  modeSelectLabel: optional(pipe(string(), trim())),
});

export type AgentPreset = InferOutput<typeof agentPresetSchema>;

export const modeOptionSchema = object({
  id: pipe(string(), trim()),
  name: pipe(string(), trim()),
  description: nullable(optional(pipe(string(), trim()))),
});

export type ModeOption = InferOutput<typeof modeOptionSchema>;

export const modelOptionSchema = object({
  id: pipe(string(), trim()),
  name: pipe(string(), trim()),
  description: nullable(optional(pipe(string(), trim()))),
});

export type ModelOption = InferOutput<typeof modelOptionSchema>;

export const sessionOriginSchema = union([literal('new'), literal('loaded')]);

export type SessionOrigin = InferOutput<typeof sessionOriginSchema>;

export const sessionStatusSchema = union([
  literal('running'),
  literal('paused'),
  literal('inactive'),
]);

export type SessionStatus = InferOutput<typeof sessionStatusSchema>;

export const sessionSummarySchema = object({
  sessionId: pipe(string(), trim()),
  origin: sessionOriginSchema,
  status: sessionStatusSchema,
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: nullable(optional(pipe(string(), trim()))),
  command: pipe(string(), trim()),
  args: array(pipe(string(), trim())),
  cwd: pipe(string(), trim()),
  createdAt: pipe(string(), trim()),
  isActive: boolean(),
  title: nullable(optional(pipe(string(), trim()))),
  firstUserMessagePreview: nullable(optional(pipe(string(), trim()))),
  updatedAt: nullable(optional(pipe(string(), trim()))),
  currentModeId: nullable(optional(pipe(string(), trim()))),
  currentModelId: nullable(optional(pipe(string(), trim()))),
  availableModes: array(modeOptionSchema),
  availableModels: array(modelOptionSchema),
});

export type SessionSummary = InferOutput<typeof sessionSummarySchema>;

export const planEventSchema = object({
  type: literal('plan'),
  entries: array(pipe(string(), trim())),
  rawText: pipe(string(), trim()),
});

export const diffEventSchema = object({
  type: literal('diff'),
  path: pipe(string(), trim()),
  oldText: nullable(optional(string())),
  newText: nullable(optional(string())),
  rawText: pipe(string(), trim()),
});

export const terminalEventSchema = object({
  type: literal('terminal'),
  terminalId: nullable(optional(pipe(string(), trim()))),
  text: string(),
  rawText: pipe(string(), trim()),
});

export const reasoningEventSchema = object({
  type: literal('reasoning'),
  text: string(),
  rawText: string(),
});

export const toolCallEventSchema = object({
  type: literal('toolCall'),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  inputText: string(),
  rawText: string(),
});

export const toolResultEventSchema = object({
  type: literal('toolResult'),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  outputText: string(),
  rawText: string(),
});

export const toolErrorEventSchema = object({
  type: literal('toolError'),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  errorText: string(),
  rawText: string(),
});

/** fullStream 上の補助パーツ（start / finish 等）のトレース用 */
export const streamPartEventSchema = object({
  type: literal('streamPart'),
  partType: pipe(string(), trim()),
  text: string(),
  rawText: string(),
});

export const toolInputEventSchema = object({
  type: literal('toolInput'),
  streamId: pipe(string(), trim()),
  text: string(),
  rawText: string(),
});

export const rawEventSchema = union([
  planEventSchema,
  diffEventSchema,
  terminalEventSchema,
  reasoningEventSchema,
  toolCallEventSchema,
  toolResultEventSchema,
  toolErrorEventSchema,
  streamPartEventSchema,
  toolInputEventSchema,
]);

export type RawEvent = InferOutput<typeof rawEventSchema>;

export const appInfoSchema = object({
  appName: pipe(string(), trim()),
  workingDirectory: pipe(string(), trim()),
  projectsFilePath: pipe(string(), trim()),
  agentPresets: array(agentPresetSchema),
});

export type AppInfo = InferOutput<typeof appInfoSchema>;

export const filesystemEntrySchema = object({
  name: pipe(string(), trim()),
  path: pipe(string(), trim()),
  kind: union([literal('directory'), literal('file')]),
  children: optional(
    array(
      object({
        name: pipe(string(), trim()),
        path: pipe(string(), trim()),
        kind: union([literal('directory'), literal('file')]),
      }),
    ),
  ),
});

export type FilesystemEntry = InferOutput<typeof filesystemEntrySchema>;

export const filesystemTreeResponseSchema = object({
  root: filesystemEntrySchema,
});

export type FilesystemTreeResponse = InferOutput<typeof filesystemTreeResponseSchema>;

export const directoryEntrySchema = object({
  name: pipe(string(), trim()),
  path: pipe(string(), trim()),
  type: union([literal('directory'), literal('file')]),
});

export type DirectoryEntry = InferOutput<typeof directoryEntrySchema>;

export const directoryListingResponseSchema = object({
  entries: array(directoryEntrySchema),
  currentPath: pipe(string(), trim()),
});

export type DirectoryListingResponse = InferOutput<typeof directoryListingResponseSchema>;

export const uploadedAttachmentSchema = object({
  attachmentId: pipe(string(), trim()),
  name: pipe(string(), trim()),
  mediaType: pipe(string(), trim()),
  sizeInBytes: number(),
});

export type UploadedAttachment = InferOutput<typeof uploadedAttachmentSchema>;

export const uploadAttachmentsResponseSchema = object({
  attachments: array(uploadedAttachmentSchema),
});

export type UploadAttachmentsResponse = InferOutput<typeof uploadAttachmentsResponseSchema>;

export const projectSchema = object({
  id: pipe(string(), trim()),
  name: pipe(string(), trim()),
  workingDirectory: pipe(string(), trim()),
});

export type Project = InferOutput<typeof projectSchema>;

export const createProjectRequestSchema = object({
  name: pipe(string(), trim()),
  workingDirectory: pipe(string(), trim()),
});

export type CreateProjectRequest = InferOutput<typeof createProjectRequestSchema>;

export const projectResponseSchema = object({
  project: projectSchema,
});

export type ProjectResponse = InferOutput<typeof projectResponseSchema>;

export const projectsResponseSchema = object({
  projects: array(projectSchema),
});

export type ProjectsResponse = InferOutput<typeof projectsResponseSchema>;

export const projectModelPreferenceSchema = object({
  presetId: pipe(string(), trim()),
  modelId: pipe(string(), trim()),
  isFavorite: boolean(),
  lastUsedAt: nullable(optional(pipe(string(), trim()))),
  updatedAt: pipe(string(), trim()),
});

export type ProjectModelPreference = InferOutput<typeof projectModelPreferenceSchema>;

export const projectSettingsSchema = object({
  projectId: pipe(string(), trim()),
  modelPreferences: array(projectModelPreferenceSchema),
});

export type ProjectSettings = InferOutput<typeof projectSettingsSchema>;

export const projectSettingsResponseSchema = object({
  settings: projectSettingsSchema,
});

export type ProjectSettingsResponse = InferOutput<typeof projectSettingsResponseSchema>;

export const updateProjectModelPreferenceRequestSchema = object({
  presetId: pipe(string(), trim()),
  modelId: pipe(string(), trim()),
  isFavorite: optional(boolean()),
  markLastUsed: optional(boolean()),
});

export type UpdateProjectModelPreferenceRequest = InferOutput<
  typeof updateProjectModelPreferenceRequestSchema
>;

export const createSessionRequestSchema = object({
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: nullable(optional(pipe(string(), trim()))),
  command: nullable(optional(pipe(string(), trim()))),
  argsText: optional(string()),
  cwd: nullable(optional(pipe(string(), trim()))),
  modelId: optional(nullable(pipe(string(), trim()))),
  modeId: optional(nullable(pipe(string(), trim()))),
});

export type CreateSessionRequest = InferOutput<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = object({
  modeId: optional(nullable(pipe(string(), trim()))),
  modelId: optional(nullable(pipe(string(), trim()))),
});

export type UpdateSessionRequest = InferOutput<typeof updateSessionRequestSchema>;

export const discoverResumableSessionsRequestSchema = object({
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: nullable(optional(pipe(string(), trim()))),
  cwd: nullable(optional(pipe(string(), trim()))),
});

export type DiscoverResumableSessionsRequest = InferOutput<
  typeof discoverResumableSessionsRequestSchema
>;

/** プロジェクト＋プリセット向け。永続セッションなしで initSession 相当の一覧を返す。 */
export const agentModelCatalogQuerySchema = object({
  projectId: pipe(string(), trim()),
  presetId: optional(pipe(string(), trim()), 'codex'),
});

export type AgentModelCatalogQuery = InferOutput<typeof agentModelCatalogQuerySchema>;

export const agentModelCatalogResponseSchema = object({
  availableModels: array(modelOptionSchema),
  availableModes: array(modeOptionSchema),
  currentModelId: nullable(optional(pipe(string(), trim()))),
  currentModeId: nullable(optional(pipe(string(), trim()))),
  lastError: nullable(optional(string())),
});

export type AgentModelCatalogResponse = InferOutput<typeof agentModelCatalogResponseSchema>;

export const slashCommandSchema = object({
  name: pipe(string(), trim()),
  description: pipe(string(), trim()),
  inputHint: nullable(optional(pipe(string(), trim()))),
});

export type SlashCommand = InferOutput<typeof slashCommandSchema>;

export const agentSlashCommandsQuerySchema = object({
  projectId: pipe(string(), trim()),
  presetId: optional(pipe(string(), trim()), 'codex'),
});

export type AgentSlashCommandsQuery = InferOutput<typeof agentSlashCommandsQuerySchema>;

export const agentSlashCommandsResponseSchema = object({
  commands: array(slashCommandSchema),
  lastError: nullable(optional(string())),
});

export type AgentSlashCommandsResponse = InferOutput<typeof agentSlashCommandsResponseSchema>;

export const agentProviderStatusSchema = object({
  preset: agentPresetSchema,
  enabled: boolean(),
  enabledAt: nullable(optional(pipe(string(), trim()))),
  updatedAt: nullable(optional(pipe(string(), trim()))),
});

export type AgentProviderStatus = InferOutput<typeof agentProviderStatusSchema>;

export const agentProvidersResponseSchema = object({
  providers: array(agentProviderStatusSchema),
});

export type AgentProvidersResponse = InferOutput<typeof agentProvidersResponseSchema>;

export const appSetupStateSchema = object({
  initialSetupCompleted: boolean(),
  completedAt: nullable(optional(pipe(string(), trim()))),
});

export type AppSetupState = InferOutput<typeof appSetupStateSchema>;

export const appSetupStateResponseSchema = object({
  setup: appSetupStateSchema,
});

export type AppSetupStateResponse = InferOutput<typeof appSetupStateResponseSchema>;

export const updateAgentProviderRequestSchema = object({
  enabled: boolean(),
});

export type UpdateAgentProviderRequest = InferOutput<typeof updateAgentProviderRequestSchema>;

export const checkAgentProviderRequestSchema = object({
  cwd: nullable(optional(pipe(string(), trim()))),
});

export type CheckAgentProviderRequest = InferOutput<typeof checkAgentProviderRequestSchema>;

export const prepareAgentSessionRequestSchema = object({
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: pipe(string(), trim()),
  cwd: nullable(optional(pipe(string(), trim()))),
  modelId: optional(nullable(pipe(string(), trim()))),
  modeId: optional(nullable(pipe(string(), trim()))),
});

export type PrepareAgentSessionRequest = InferOutput<typeof prepareAgentSessionRequestSchema>;

export const prepareAgentSessionResponseSchema = object({
  prepareId: pipe(string(), trim()),
});

export type PrepareAgentSessionResponse = InferOutput<typeof prepareAgentSessionResponseSchema>;

export const resumeCapabilitySchema = object({
  loadSession: boolean(),
  listSessions: boolean(),
  resumeSession: boolean(),
  canLoadIntoProvider: boolean(),
  fallbackReason: nullable(optional(pipe(string(), trim()))),
});

export type ResumeCapability = InferOutput<typeof resumeCapabilitySchema>;

export const resumableSessionCandidateSchema = object({
  sessionId: pipe(string(), trim()),
  cwd: pipe(string(), trim()),
  title: nullable(optional(pipe(string(), trim()))),
  updatedAt: nullable(optional(pipe(string(), trim()))),
  loadable: boolean(),
});

export type ResumableSessionCandidate = InferOutput<typeof resumableSessionCandidateSchema>;

export const resumableSessionsResponseSchema = object({
  capability: resumeCapabilitySchema,
  sessions: array(resumableSessionCandidateSchema),
});

export type ResumableSessionsResponse = InferOutput<typeof resumableSessionsResponseSchema>;

export const loadSessionRequestSchema = object({
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: nullable(optional(pipe(string(), trim()))),
  sessionId: pipe(string(), trim()),
  cwd: nullable(optional(pipe(string(), trim()))),
  title: nullable(optional(pipe(string(), trim()))),
  updatedAt: nullable(optional(pipe(string(), trim()))),
});

export type LoadSessionRequest = InferOutput<typeof loadSessionRequestSchema>;

export const acpPermissionOptionSchema = object({
  id: pipe(string(), trim()),
  kind: union([
    literal('allow_once'),
    literal('allow_always'),
    literal('reject_once'),
    literal('reject_always'),
  ]),
  name: pipe(string(), trim()),
});

export type AcpPermissionOption = InferOutput<typeof acpPermissionOptionSchema>;

export const acpPermissionRequestSchema = object({
  id: pipe(string(), trim()),
  sessionId: pipe(string(), trim()),
  toolCallId: pipe(string(), trim()),
  title: nullable(optional(pipe(string(), trim()))),
  kind: nullable(optional(pipe(string(), trim()))),
  rawInputText: nullable(optional(string())),
  options: array(acpPermissionOptionSchema),
  createdAt: pipe(string(), trim()),
});

export type AcpPermissionRequest = InferOutput<typeof acpPermissionRequestSchema>;

export const acpPermissionRequestsResponseSchema = object({
  requests: array(acpPermissionRequestSchema),
});

export type AcpPermissionRequestsResponse = InferOutput<typeof acpPermissionRequestsResponseSchema>;

export const resolveAcpPermissionRequestSchema = object({
  optionId: nullable(optional(pipe(string(), trim()))),
});

export type ResolveAcpPermissionRequest = InferOutput<typeof resolveAcpPermissionRequestSchema>;

export const sendMessageRequestSchema = object({
  prompt: pipe(string(), trim()),
  attachmentIds: optional(array(pipe(string(), trim()))),
  modelId: optional(nullable(pipe(string(), trim()))),
  modeId: optional(nullable(pipe(string(), trim()))),
});

export type SendMessageRequest = InferOutput<typeof sendMessageRequestSchema>;

export const sessionResponseSchema = object({
  session: sessionSummarySchema,
});

export type SessionResponse = InferOutput<typeof sessionResponseSchema>;

export const sessionsResponseSchema = object({
  sessions: array(sessionSummarySchema),
});

export type SessionsResponse = InferOutput<typeof sessionsResponseSchema>;

export const chatMessageRoleSchema = union([literal('user'), literal('assistant')]);

export type ChatMessageRole = InferOutput<typeof chatMessageRoleSchema>;

/** 1 行の session_messages に対応（ストリーム単位・ツール単位を区別） */
export const chatMessageKindSchema = union([
  literal('user'),
  literal('legacy_assistant_turn'),
  literal('assistant_text'),
  literal('reasoning'),
  literal('tool_input'),
  literal('tool_call'),
  literal('tool_result'),
  literal('tool_error'),
  literal('tool_output_denied'),
  literal('tool_approval_request'),
  literal('source'),
  literal('file'),
  literal('stream_start'),
  literal('stream_finish'),
  literal('step_start'),
  literal('step_finish'),
  literal('abort'),
  literal('stream_error'),
  literal('raw_meta'),
]);

export type ChatMessageKind = InferOutput<typeof chatMessageKindSchema>;

export const chatMessageSchema = object({
  id: pipe(string(), trim()),
  role: chatMessageRoleSchema,
  kind: optional(chatMessageKindSchema),
  text: string(),
  rawEvents: array(rawEventSchema),
  createdAt: pipe(string(), trim()),
  updatedAt: optional(nullable(pipe(string(), trim()))),
  streamPartId: optional(nullable(pipe(string(), trim()))),
  metadataJson: optional(nullable(pipe(string(), trim()))),
});

export type ChatMessage = InferOutput<typeof chatMessageSchema>;

export const messageResponseSchema = object({
  session: sessionSummarySchema,
  text: string(),
  rawEvents: array(rawEventSchema),
  /** 今回のユーザ発話以降のアシスタント側セグメント（時系列）。空のときは text/rawEvents の集約のみ */
  assistantSegmentMessages: optional(array(chatMessageSchema)),
});

export type MessageResponse = InferOutput<typeof messageResponseSchema>;

export const sessionMessagesResponseSchema = object({
  messages: array(chatMessageSchema),
});

export type SessionMessagesResponse = InferOutput<typeof sessionMessagesResponseSchema>;

/**
 * ACP セッション通知（SSE `data:` 1 行＝ 1 件の JSON テキスト）。共有スキーマで型を揃える。
 */
export const acpSseEventSchema = union([
  object({
    type: literal('session_updated'),
    sessionId: pipe(string(), trim()),
    status: optional(sessionStatusSchema),
  }),
  object({
    type: literal('session_text_delta'),
    sessionId: pipe(string(), trim()),
    messageId: pipe(string(), trim()),
    streamPartId: pipe(string(), trim()),
    delta: string(),
    text: string(),
    createdAt: pipe(string(), trim()),
    updatedAt: pipe(string(), trim()),
    metadataJson: optional(nullable(pipe(string(), trim()))),
  }),
  object({
    type: literal('session_reasoning_delta'),
    sessionId: pipe(string(), trim()),
    messageId: pipe(string(), trim()),
    streamPartId: pipe(string(), trim()),
    delta: string(),
    text: string(),
    createdAt: pipe(string(), trim()),
    updatedAt: pipe(string(), trim()),
    metadataJson: optional(nullable(pipe(string(), trim()))),
  }),
  object({
    type: literal('session_messages_updated'),
    sessionId: pipe(string(), trim()),
  }),
  object({
    type: literal('session_removed'),
    sessionId: pipe(string(), trim()),
  }),
  object({
    type: literal('agent_catalog_updated'),
    presetId: pipe(string(), trim()),
    cwd: pipe(string(), trim()),
  }),
  object({
    type: literal('permission_requests_updated'),
    sessionId: optional(pipe(string(), trim())),
  }),
]);

export type AcpSseEvent = InferOutput<typeof acpSseEventSchema>;

export const parseAcpSseEventJson = (line: string): AcpSseEvent => {
  const data: unknown = JSON.parse(line);
  return parse(acpSseEventSchema, data);
};
