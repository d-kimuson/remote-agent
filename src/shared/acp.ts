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
  safeParse,
  string,
  trim,
  union,
  unknown,
  type InferOutput,
} from 'valibot';

export const agentPresetSchema = object({
  id: pipe(string(), trim()),
  label: pipe(string(), trim()),
  description: pipe(string(), trim()),
  command: pipe(string(), trim()),
  args: array(pipe(string(), trim())),
  authMethodId: optional(pipe(string(), trim())),
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

export const sessionConfigOptionValueSchema = object({
  value: pipe(string(), trim()),
  name: pipe(string(), trim()),
  description: nullable(optional(pipe(string(), trim()))),
});

export type SessionConfigOptionValue = InferOutput<typeof sessionConfigOptionValueSchema>;

export const sessionConfigOptionSchema = object({
  id: pipe(string(), trim()),
  name: pipe(string(), trim()),
  category: nullable(optional(pipe(string(), trim()))),
  description: nullable(optional(pipe(string(), trim()))),
  currentValue: pipe(string(), trim()),
  values: array(sessionConfigOptionValueSchema),
});

export type SessionConfigOption = InferOutput<typeof sessionConfigOptionSchema>;

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
  configOptions: array(sessionConfigOptionSchema),
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
  literal('x-error'),
]);

export type ChatMessageKind = InferOutput<typeof chatMessageKindSchema>;

const persistedMessageBaseSchema = object({
  schemaVersion: literal(1),
  role: chatMessageRoleSchema,
  createdAt: pipe(string(), trim()),
});

const textPartEnvelopeSchema = object({
  start: optional(unknown()),
  end: optional(unknown()),
});

export const mediaTypeSchema = pipe(string(), trim());

export const imageBlockSourceSchema = object({
  type: literal('base64'),
  media_type: mediaTypeSchema,
  data: string(),
});

export const imageBlockSchema = object({
  type: literal('image'),
  source: imageBlockSourceSchema,
});

export const userAttachmentSchema = object({
  ...imageBlockSchema.entries,
  attachmentId: optional(pipe(string(), trim())),
  name: optional(pipe(string(), trim())),
  sizeInBytes: optional(number()),
});

export type UserAttachment = InferOutput<typeof userAttachmentSchema>;

export const userRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('user'),
  role: literal('user'),
  text: string(),
  attachments: optional(array(userAttachmentSchema)),
  promptPlan: optional(unknown()),
});

export const assistantTextRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('assistant_text'),
  role: literal('assistant'),
  streamPartId: pipe(string(), trim()),
  providerStreamId: pipe(string(), trim()),
  text: string(),
  parts: optional(textPartEnvelopeSchema),
  deltaCount: optional(number()),
  endedAt: optional(pipe(string(), trim())),
});

export const reasoningRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('reasoning'),
  role: literal('assistant'),
  streamPartId: pipe(string(), trim()),
  providerStreamId: pipe(string(), trim()),
  text: string(),
  parts: optional(textPartEnvelopeSchema),
  deltaCount: optional(number()),
  endedAt: optional(pipe(string(), trim())),
});

export const toolInputRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('tool_input'),
  role: literal('assistant'),
  streamPartId: pipe(string(), trim()),
  providerStreamId: pipe(string(), trim()),
  text: string(),
  toolName: optional(nullable(pipe(string(), trim()))),
  providerExecuted: optional(nullable(boolean())),
  dynamic: optional(nullable(boolean())),
  title: optional(nullable(pipe(string(), trim()))),
  parts: optional(textPartEnvelopeSchema),
  deltaCount: optional(number()),
  endedAt: optional(pipe(string(), trim())),
});

export const legacyAssistantTurnRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('legacy_assistant_turn'),
  role: literal('assistant'),
  text: string(),
  rawEvents: array(rawEventSchema),
  metadata: optional(unknown()),
});

type SinglePartRawType =
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'tool_output_denied'
  | 'tool_approval_request'
  | 'source'
  | 'file'
  | 'stream_start'
  | 'stream_finish'
  | 'step_start'
  | 'step_finish'
  | 'abort'
  | 'stream_error';

const singlePartRawSchema = <T extends SinglePartRawType>(type: T) =>
  object({
    ...persistedMessageBaseSchema.entries,
    type: literal(type),
    role: literal('assistant'),
    part: unknown(),
    text: optional(string()),
  });

export const toolCallRawSchema = object({
  ...singlePartRawSchema('tool_call').entries,
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
});

export const toolResultRawSchema = object({
  ...singlePartRawSchema('tool_result').entries,
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
});

export const toolErrorRawSchema = object({
  ...singlePartRawSchema('tool_error').entries,
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
});

export const rawMetaRawSchema = object({
  ...persistedMessageBaseSchema.entries,
  type: literal('raw_meta'),
  role: literal('assistant'),
  text: string(),
  part: optional(unknown()),
});

export const xErrorRawSchema = object({
  schemaVersion: literal(1),
  type: literal('x-error'),
  role: literal('assistant'),
  sourceKind: pipe(string(), trim()),
  errorMessage: string(),
  rawJsonText: string(),
  issues: array(object({ message: string() })),
  createdAt: pipe(string(), trim()),
});

export const persistedMessageRawSchema = union([
  userRawSchema,
  assistantTextRawSchema,
  reasoningRawSchema,
  toolInputRawSchema,
  legacyAssistantTurnRawSchema,
  toolCallRawSchema,
  toolResultRawSchema,
  toolErrorRawSchema,
  singlePartRawSchema('tool_output_denied'),
  singlePartRawSchema('tool_approval_request'),
  singlePartRawSchema('source'),
  singlePartRawSchema('file'),
  singlePartRawSchema('stream_start'),
  singlePartRawSchema('stream_finish'),
  singlePartRawSchema('step_start'),
  singlePartRawSchema('step_finish'),
  singlePartRawSchema('abort'),
  singlePartRawSchema('stream_error'),
  rawMetaRawSchema,
  xErrorRawSchema,
]);

export type PersistedMessageRaw = InferOutput<typeof persistedMessageRawSchema>;
export type XErrorRaw = InferOutput<typeof xErrorRawSchema>;

export const chatMessageRawKind = (rawJson: PersistedMessageRaw): ChatMessageKind | 'x-error' =>
  rawJson.type;

export const chatMessageRoleFromRaw = (rawJson: PersistedMessageRaw): ChatMessageRole =>
  rawJson.role;

export const chatMessageTextFromRaw = (rawJson: PersistedMessageRaw): string => {
  switch (rawJson.type) {
    case 'user':
    case 'assistant_text':
    case 'reasoning':
    case 'tool_input':
    case 'legacy_assistant_turn':
    case 'raw_meta':
      return rawJson.text;
    case 'x-error':
      return rawJson.errorMessage;
    case 'tool_call':
    case 'tool_result':
    case 'tool_error':
    case 'tool_output_denied':
    case 'tool_approval_request':
    case 'source':
    case 'file':
    case 'stream_start':
    case 'stream_finish':
    case 'step_start':
    case 'step_finish':
    case 'abort':
    case 'stream_error':
      if ('text' in rawJson && typeof rawJson.text === 'string') {
        return rawJson.text;
      }
      return JSON.stringify(rawJson.part);
    default: {
      const exhaustive: never = rawJson;
      return exhaustive;
    }
  }
};

export const chatMessageRawEventsFromRaw = (rawJson: PersistedMessageRaw): readonly RawEvent[] => {
  switch (rawJson.type) {
    case 'user':
    case 'assistant_text':
    case 'raw_meta':
    case 'x-error':
      return [];
    case 'reasoning':
      return rawJson.text.length > 0
        ? [{ type: 'reasoning', text: rawJson.text, rawText: rawJson.text }]
        : [];
    case 'tool_input':
      return rawJson.text.length > 0
        ? [
            {
              type: 'toolInput',
              streamId: rawJson.providerStreamId,
              text: rawJson.text,
              rawText: rawJson.text,
            },
          ]
        : [];
    case 'legacy_assistant_turn':
      return rawJson.rawEvents;
    case 'tool_call':
      return [
        {
          type: 'toolCall',
          toolCallId: rawJson.toolCallId,
          toolName: rawJson.toolName,
          inputText: JSON.stringify(rawJson.part),
          rawText: JSON.stringify(rawJson.part),
        },
      ];
    case 'tool_result':
      return [
        {
          type: 'toolResult',
          toolCallId: rawJson.toolCallId,
          toolName: rawJson.toolName,
          outputText: JSON.stringify(rawJson.part),
          rawText: JSON.stringify(rawJson.part),
        },
      ];
    case 'tool_error':
      return [
        {
          type: 'toolError',
          toolCallId: rawJson.toolCallId,
          toolName: rawJson.toolName,
          errorText: JSON.stringify(rawJson.part),
          rawText: JSON.stringify(rawJson.part),
        },
      ];
    case 'stream_start':
    case 'stream_finish':
    case 'step_start':
    case 'step_finish':
    case 'abort':
    case 'stream_error':
    case 'source':
    case 'file':
    case 'tool_output_denied':
    case 'tool_approval_request':
      return [
        {
          type: 'streamPart',
          partType: rawJson.type,
          text: JSON.stringify(rawJson.part),
          rawText: JSON.stringify(rawJson.part),
        },
      ];
    default: {
      const exhaustive: never = rawJson;
      return exhaustive;
    }
  }
};

export const parsePersistedMessageRaw = (value: unknown) =>
  safeParse(persistedMessageRawSchema, value);

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

export const fileCompletionEntrySchema = object({
  name: pipe(string(), trim()),
  path: pipe(string(), trim()),
  type: union([literal('directory'), literal('file')]),
});

export type FileCompletionEntry = InferOutput<typeof fileCompletionEntrySchema>;

export const fileCompletionResponseSchema = object({
  entries: array(fileCompletionEntrySchema),
  basePath: pipe(string(), trim()),
  projectPath: pipe(string(), trim()),
});

export type FileCompletionResponse = InferOutput<typeof fileCompletionResponseSchema>;

export const uploadedAttachmentSchema = object({
  attachmentId: pipe(string(), trim()),
  name: pipe(string(), trim()),
  mediaType: mediaTypeSchema,
  sizeInBytes: number(),
  source: optional(imageBlockSourceSchema),
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
  worktreeSetupScript: optional(string()),
});

export type Project = InferOutput<typeof projectSchema>;

export const createProjectRequestSchema = object({
  name: pipe(string(), trim()),
  workingDirectory: pipe(string(), trim()),
});

export type CreateProjectRequest = InferOutput<typeof createProjectRequestSchema>;

export const createProjectWorktreeRequestSchema = object({
  name: pipe(string(), trim()),
  branchName: optional(pipe(string(), trim())),
  baseRef: optional(pipe(string(), trim())),
});

export type CreateProjectWorktreeRequest = InferOutput<typeof createProjectWorktreeRequestSchema>;

export const projectResponseSchema = object({
  project: projectSchema,
});

export type ProjectResponse = InferOutput<typeof projectResponseSchema>;

export const projectsResponseSchema = object({
  projects: array(projectSchema),
});

export type ProjectsResponse = InferOutput<typeof projectsResponseSchema>;

export const projectWorktreeSchema = object({
  projectId: pipe(string(), trim()),
  name: pipe(string(), trim()),
  path: pipe(string(), trim()),
  branchName: pipe(string(), trim()),
  baseRef: pipe(string(), trim()),
  createdAt: pipe(string(), trim()),
});

export type ProjectWorktree = InferOutput<typeof projectWorktreeSchema>;

export const projectWorktreeResponseSchema = object({
  worktree: projectWorktreeSchema,
});

export type ProjectWorktreeResponse = InferOutput<typeof projectWorktreeResponseSchema>;

export const gitDiffLineSchema = object({
  type: union([
    literal('added'),
    literal('deleted'),
    literal('unchanged'),
    literal('hunk'),
    literal('context'),
  ]),
  oldLineNumber: optional(number()),
  newLineNumber: optional(number()),
  content: string(),
});

export type GitDiffLine = InferOutput<typeof gitDiffLineSchema>;

export const gitDiffHunkSchema = object({
  oldStart: number(),
  newStart: number(),
  lines: array(gitDiffLineSchema),
});

export type GitDiffHunk = InferOutput<typeof gitDiffHunkSchema>;

export const gitFileDiffSchema = object({
  filename: pipe(string(), trim()),
  oldFilename: optional(pipe(string(), trim())),
  isNew: boolean(),
  isDeleted: boolean(),
  isRenamed: boolean(),
  isBinary: boolean(),
  hunks: array(gitDiffHunkSchema),
  linesAdded: number(),
  linesDeleted: number(),
});

export type GitFileDiff = InferOutput<typeof gitFileDiffSchema>;

export const gitDiffRequestSchema = object({
  fromRef: pipe(string(), trim()),
  toRef: pipe(string(), trim()),
});

export type GitDiffRequest = InferOutput<typeof gitDiffRequestSchema>;

export const gitDiffResponseSchema = object({
  files: array(gitFileDiffSchema),
  summary: object({
    totalFiles: number(),
    totalAdditions: number(),
    totalDeletions: number(),
  }),
});

export type GitDiffResponse = InferOutput<typeof gitDiffResponseSchema>;

export const gitRevisionRefSchema = object({
  name: pipe(string(), trim()),
  type: union([literal('branch'), literal('commit'), literal('head'), literal('working')]),
  displayName: pipe(string(), trim()),
  sha: optional(pipe(string(), trim())),
});

export type GitRevisionRef = InferOutput<typeof gitRevisionRefSchema>;

export const gitRevisionsResponseSchema = object({
  refs: array(gitRevisionRefSchema),
});

export type GitRevisionsResponse = InferOutput<typeof gitRevisionsResponseSchema>;

export const projectModelPreferenceSchema = object({
  presetId: pipe(string(), trim()),
  modelId: pipe(string(), trim()),
  isFavorite: boolean(),
  lastUsedAt: nullable(optional(pipe(string(), trim()))),
  updatedAt: pipe(string(), trim()),
});

export type ProjectModelPreference = InferOutput<typeof projectModelPreferenceSchema>;

export const projectModePreferenceSchema = object({
  presetId: pipe(string(), trim()),
  modeId: pipe(string(), trim()),
  lastUsedAt: nullable(optional(pipe(string(), trim()))),
  updatedAt: pipe(string(), trim()),
});

export type ProjectModePreference = InferOutput<typeof projectModePreferenceSchema>;

export const projectSettingsSchema = object({
  projectId: pipe(string(), trim()),
  modelPreferences: array(projectModelPreferenceSchema),
  modePreferences: array(projectModePreferenceSchema),
  worktreeSetupScript: string(),
});

export type ProjectSettings = InferOutput<typeof projectSettingsSchema>;

export const projectSettingsResponseSchema = object({
  settings: projectSettingsSchema,
});

export type ProjectSettingsResponse = InferOutput<typeof projectSettingsResponseSchema>;

export const updateProjectSettingsRequestSchema = object({
  name: pipe(string(), trim()),
  worktreeSetupScript: string(),
});

export type UpdateProjectSettingsRequest = InferOutput<typeof updateProjectSettingsRequestSchema>;

export const updateProjectModelPreferenceRequestSchema = object({
  presetId: pipe(string(), trim()),
  modelId: pipe(string(), trim()),
  isFavorite: optional(boolean()),
  markLastUsed: optional(boolean()),
});

export type UpdateProjectModelPreferenceRequest = InferOutput<
  typeof updateProjectModelPreferenceRequestSchema
>;

export const updateProjectModePreferenceRequestSchema = object({
  presetId: pipe(string(), trim()),
  modeId: pipe(string(), trim()),
  markLastUsed: optional(boolean()),
});

export type UpdateProjectModePreferenceRequest = InferOutput<
  typeof updateProjectModePreferenceRequestSchema
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

export const updateSessionConfigOptionRequestSchema = object({
  configId: pipe(string(), trim()),
  value: pipe(string(), trim()),
});

export type UpdateSessionConfigOptionRequest = InferOutput<
  typeof updateSessionConfigOptionRequestSchema
>;

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

export const agentProviderCatalogSummarySchema = object({
  availableModelCount: number(),
  availableModeCount: number(),
  currentModelId: nullable(optional(pipe(string(), trim()))),
  currentModeId: nullable(optional(pipe(string(), trim()))),
  lastError: nullable(optional(string())),
  refreshedAt: nullable(optional(pipe(string(), trim()))),
});

export type AgentProviderCatalogSummary = InferOutput<typeof agentProviderCatalogSummarySchema>;

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
  catalogSummary: optional(nullable(agentProviderCatalogSummarySchema)),
});

export type AgentProviderStatus = InferOutput<typeof agentProviderStatusSchema>;

export const agentProvidersResponseSchema = object({
  providers: array(agentProviderStatusSchema),
});

export type AgentProvidersResponse = InferOutput<typeof agentProvidersResponseSchema>;

export const createCustomAgentProviderRequestSchema = object({
  name: pipe(string(), trim()),
  commandText: pipe(string(), trim()),
});

export type CreateCustomAgentProviderRequest = InferOutput<
  typeof createCustomAgentProviderRequestSchema
>;

export const updateCustomAgentProviderRequestSchema = object({
  name: pipe(string(), trim()),
  commandText: pipe(string(), trim()),
});

export type UpdateCustomAgentProviderRequest = InferOutput<
  typeof updateCustomAgentProviderRequestSchema
>;

export const appSetupStateSchema = object({
  initialSetupCompleted: boolean(),
  completedAt: nullable(optional(pipe(string(), trim()))),
});

export type AppSetupState = InferOutput<typeof appSetupStateSchema>;

export const appSetupStateResponseSchema = object({
  setup: appSetupStateSchema,
});

export type AppSetupStateResponse = InferOutput<typeof appSetupStateResponseSchema>;

export const appSubmitKeyBindingSchema = union([literal('mod-enter'), literal('enter')]);

export type AppSubmitKeyBinding = InferOutput<typeof appSubmitKeyBindingSchema>;

export const appSettingsSchema = object({
  submitKeyBinding: appSubmitKeyBindingSchema,
});

export type AppSettings = InferOutput<typeof appSettingsSchema>;

export const appSettingsResponseSchema = object({
  settings: appSettingsSchema,
});

export type AppSettingsResponse = InferOutput<typeof appSettingsResponseSchema>;

export const updateAppSettingsRequestSchema = object({
  submitKeyBinding: appSubmitKeyBindingSchema,
});

export type UpdateAppSettingsRequest = InferOutput<typeof updateAppSettingsRequestSchema>;

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

export const routineSendConfigSchema = object({
  projectId: nullable(optional(pipe(string(), trim()))),
  presetId: pipe(string(), trim()),
  cwd: nullable(optional(pipe(string(), trim()))),
  modelId: optional(nullable(pipe(string(), trim()))),
  modeId: optional(nullable(pipe(string(), trim()))),
  prompt: pipe(string(), trim()),
});

export type RoutineSendConfig = InferOutput<typeof routineSendConfigSchema>;

export const cronRoutineConfigSchema = object({
  cronExpression: pipe(string(), trim()),
});

export type CronRoutineConfig = InferOutput<typeof cronRoutineConfigSchema>;

export const scheduledRoutineConfigSchema = object({
  runAt: pipe(string(), trim()),
});

export type ScheduledRoutineConfig = InferOutput<typeof scheduledRoutineConfigSchema>;

export const routineConfigSchema = union([cronRoutineConfigSchema, scheduledRoutineConfigSchema]);

export type RoutineConfig = InferOutput<typeof routineConfigSchema>;

export const routineKindSchema = union([literal('cron'), literal('scheduled')]);

export type RoutineKind = InferOutput<typeof routineKindSchema>;

export const routineSchema = union([
  object({
    id: pipe(string(), trim()),
    name: pipe(string(), trim()),
    enabled: boolean(),
    kind: literal('cron'),
    config: cronRoutineConfigSchema,
    sendConfig: routineSendConfigSchema,
    createdAt: pipe(string(), trim()),
    updatedAt: pipe(string(), trim()),
    lastRunAt: nullable(optional(pipe(string(), trim()))),
    nextRunAt: nullable(optional(pipe(string(), trim()))),
    lastError: nullable(optional(string())),
  }),
  object({
    id: pipe(string(), trim()),
    name: pipe(string(), trim()),
    enabled: boolean(),
    kind: literal('scheduled'),
    config: scheduledRoutineConfigSchema,
    sendConfig: routineSendConfigSchema,
    createdAt: pipe(string(), trim()),
    updatedAt: pipe(string(), trim()),
    lastRunAt: nullable(optional(pipe(string(), trim()))),
    nextRunAt: nullable(optional(pipe(string(), trim()))),
    lastError: nullable(optional(string())),
  }),
]);

export type Routine = InferOutput<typeof routineSchema>;

export const routinesResponseSchema = object({
  routines: array(routineSchema),
});

export type RoutinesResponse = InferOutput<typeof routinesResponseSchema>;

export const routineResponseSchema = object({
  routine: routineSchema,
});

export type RoutineResponse = InferOutput<typeof routineResponseSchema>;

export const createRoutineRequestSchema = object({
  name: pipe(string(), trim()),
  enabled: optional(boolean()),
  kind: routineKindSchema,
  config: routineConfigSchema,
  sendConfig: routineSendConfigSchema,
});

export type CreateRoutineRequest = InferOutput<typeof createRoutineRequestSchema>;

export const updateRoutineRequestSchema = object({
  name: optional(pipe(string(), trim())),
  enabled: optional(boolean()),
  kind: optional(routineKindSchema),
  config: optional(routineConfigSchema),
  sendConfig: optional(routineSendConfigSchema),
});

export type UpdateRoutineRequest = InferOutput<typeof updateRoutineRequestSchema>;

export const sessionResponseSchema = object({
  session: sessionSummarySchema,
});

export type SessionResponse = InferOutput<typeof sessionResponseSchema>;

export const cancelSessionResponseSchema = object({
  session: sessionSummarySchema,
  cancelled: boolean(),
});

export type CancelSessionResponse = InferOutput<typeof cancelSessionResponseSchema>;

export const sessionsResponseSchema = object({
  sessions: array(sessionSummarySchema),
});

export type SessionsResponse = InferOutput<typeof sessionsResponseSchema>;

export const chatMessageSchema = object({
  id: pipe(string(), trim()),
  role: chatMessageRoleSchema,
  kind: optional(chatMessageKindSchema),
  rawJson: persistedMessageRawSchema,
  textForSearch: optional(string()),
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
