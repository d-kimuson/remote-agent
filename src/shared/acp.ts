import {
  array,
  literal,
  nullable,
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

export const sessionSummarySchema = object({
  sessionId: pipe(string(), trim()),
  presetId: nullable(optional(pipe(string(), trim()))),
  command: pipe(string(), trim()),
  args: array(pipe(string(), trim())),
  cwd: pipe(string(), trim()),
  createdAt: pipe(string(), trim()),
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

export const rawEventSchema = union([planEventSchema, diffEventSchema, terminalEventSchema]);

export type RawEvent = InferOutput<typeof rawEventSchema>;

export const appInfoSchema = object({
  appName: pipe(string(), trim()),
  workingDirectory: pipe(string(), trim()),
  agentPresets: array(agentPresetSchema),
});

export type AppInfo = InferOutput<typeof appInfoSchema>;

export const createSessionRequestSchema = object({
  presetId: nullable(optional(pipe(string(), trim()))),
  command: nullable(optional(pipe(string(), trim()))),
  argsText: optional(string()),
  cwd: nullable(optional(pipe(string(), trim()))),
});

export type CreateSessionRequest = InferOutput<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = object({
  modeId: nullable(optional(pipe(string(), trim()))),
  modelId: nullable(optional(pipe(string(), trim()))),
});

export type UpdateSessionRequest = InferOutput<typeof updateSessionRequestSchema>;

export const sendMessageRequestSchema = object({
  prompt: pipe(string(), trim()),
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
