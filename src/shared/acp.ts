import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  pipe,
  string,
  trim,
  union,
  type InferOutput,
} from "valibot";

export const agentPresetSchema = object({
  id: pipe(string(), trim()),
  label: pipe(string(), trim()),
  description: pipe(string(), trim()),
  command: pipe(string(), trim()),
  args: array(pipe(string(), trim())),
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

export const sessionOriginSchema = union([literal("new"), literal("loaded")]);

export type SessionOrigin = InferOutput<typeof sessionOriginSchema>;

export const sessionSummarySchema = object({
  sessionId: pipe(string(), trim()),
  origin: sessionOriginSchema,
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
  type: literal("plan"),
  entries: array(pipe(string(), trim())),
  rawText: pipe(string(), trim()),
});

export const diffEventSchema = object({
  type: literal("diff"),
  path: pipe(string(), trim()),
  oldText: nullable(optional(string())),
  newText: nullable(optional(string())),
  rawText: pipe(string(), trim()),
});

export const terminalEventSchema = object({
  type: literal("terminal"),
  terminalId: nullable(optional(pipe(string(), trim()))),
  text: string(),
  rawText: pipe(string(), trim()),
});

export const reasoningEventSchema = object({
  type: literal("reasoning"),
  text: string(),
  rawText: string(),
});

export const toolCallEventSchema = object({
  type: literal("toolCall"),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  inputText: string(),
  rawText: string(),
});

export const toolResultEventSchema = object({
  type: literal("toolResult"),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  outputText: string(),
  rawText: string(),
});

export const toolErrorEventSchema = object({
  type: literal("toolError"),
  toolCallId: pipe(string(), trim()),
  toolName: pipe(string(), trim()),
  errorText: string(),
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
  kind: union([literal("directory"), literal("file")]),
  children: optional(
    array(
      object({
        name: pipe(string(), trim()),
        path: pipe(string(), trim()),
        kind: union([literal("directory"), literal("file")]),
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
  type: union([literal("directory"), literal("file")]),
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

export const messageResponseSchema = object({
  session: sessionSummarySchema,
  text: string(),
  rawEvents: array(rawEventSchema),
});

export type MessageResponse = InferOutput<typeof messageResponseSchema>;

export const sessionsResponseSchema = object({
  sessions: array(sessionSummarySchema),
});

export type SessionsResponse = InferOutput<typeof sessionsResponseSchema>;

export const chatMessageRoleSchema = union([literal("user"), literal("assistant")]);

export type ChatMessageRole = InferOutput<typeof chatMessageRoleSchema>;

export const chatMessageSchema = object({
  id: pipe(string(), trim()),
  role: chatMessageRoleSchema,
  text: string(),
  rawEvents: array(rawEventSchema),
  createdAt: pipe(string(), trim()),
});

export type ChatMessage = InferOutput<typeof chatMessageSchema>;

export const sessionMessagesResponseSchema = object({
  messages: array(chatMessageSchema),
});

export type SessionMessagesResponse = InferOutput<typeof sessionMessagesResponseSchema>;
