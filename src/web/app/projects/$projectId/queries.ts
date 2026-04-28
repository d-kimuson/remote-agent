import type { SessionSummary } from "../../../../shared/acp.ts";

export const appInfoQueryKey = ["app-info"] as const;
export const agentProvidersQueryKey = ["agent-providers"] as const;
export const projectsQueryKey = ["projects"] as const;
export const sessionsQueryKey = ["sessions"] as const;
export const sessionMessagesQueryKey = (sessionId: string) =>
  ["session-messages", sessionId] as const;
export const projectQueryKey = (projectId: string) => ["project", projectId] as const;
export const filesystemTreeQueryKey = (root: string) => ["filesystem-tree", root] as const;
export const resumableSessionsQueryKey = (projectId: string) =>
  ["resumable-sessions", projectId] as const;

export const agentModelCatalogQueryKey = (projectId: string, presetId: string) =>
  ["acp", "agent-model-catalog", projectId, presetId] as const;

export const selectedSessionFrom = (
  sessions: readonly SessionSummary[],
  selectedSessionId: string | null,
): SessionSummary | null =>
  sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0] ?? null;
