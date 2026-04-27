import type { SessionSummary } from "../../../../shared/acp.ts";

export const appInfoQueryKey = ["app-info"] as const;
export const sessionsQueryKey = ["sessions"] as const;
export const projectQueryKey = (projectId: string) => ["project", projectId] as const;
export const filesystemTreeQueryKey = (root: string) => ["filesystem-tree", root] as const;

export const selectedSessionFrom = (
  sessions: readonly SessionSummary[],
  selectedSessionId: string | null,
): SessionSummary | null =>
  sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0] ?? null;
