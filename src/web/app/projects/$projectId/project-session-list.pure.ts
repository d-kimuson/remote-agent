import type { SessionStatus, SessionSummary } from "../../../../shared/acp.ts";

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

export const sessionTimestamp = (session: SessionSummary): string =>
  session.updatedAt ?? session.createdAt;

const sessionStatusLabels = {
  paused: "Paused",
  running: "Running",
  inactive: "Inactive",
} as const satisfies Record<SessionStatus, string>;

const sessionStatusBadgeClassNames = {
  paused: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  running: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
  inactive: "border-gray-400/40 bg-gray-500/10 text-gray-600 dark:text-gray-300",
} as const satisfies Record<SessionStatus, string>;

const sessionStatusRowClassNames = {
  paused: "border-l-yellow-500/60 hover:border-l-yellow-500/60",
  running: "border-l-green-500/60 hover:border-l-green-500/60",
  inactive: "border-l-gray-400/70 hover:border-l-gray-400/70",
} as const satisfies Record<SessionStatus, string>;

export const sessionStatusLabel = (status: SessionStatus): string => sessionStatusLabels[status];

export const sessionStatusBadgeClassName = (status: SessionStatus): string =>
  sessionStatusBadgeClassNames[status];

export const sessionStatusRowClassName = (status: SessionStatus): string =>
  sessionStatusRowClassNames[status];

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
