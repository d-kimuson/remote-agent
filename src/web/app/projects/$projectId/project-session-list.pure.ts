import type { SessionSummary } from "../../../../shared/acp.ts";

const normalizeQuery = (query: string): string => query.trim().toLocaleLowerCase("ja-JP");

const sessionSearchText = (session: SessionSummary): string =>
  [
    session.title,
    session.firstUserMessagePreview,
    session.status,
    session.sessionId,
    session.projectId,
    session.presetId,
    session.command,
    session.cwd,
    session.currentModelId,
    session.currentModeId,
  ]
    .filter((value) => value !== null && value !== undefined && value.length > 0)
    .join(" ")
    .toLocaleLowerCase("ja-JP");

export const sortSessionsNewestFirst = (
  sessions: readonly SessionSummary[],
): readonly SessionSummary[] =>
  [...sessions].sort((left, right) => {
    const leftDate = left.updatedAt ?? left.createdAt;
    const rightDate = right.updatedAt ?? right.createdAt;
    return rightDate.localeCompare(leftDate);
  });

export const filterSessionsByQuery = ({
  query,
  sessions,
}: {
  readonly query: string;
  readonly sessions: readonly SessionSummary[];
}): readonly SessionSummary[] => {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) {
    return sessions;
  }
  return sessions.filter((session) => sessionSearchText(session).includes(normalized));
};
