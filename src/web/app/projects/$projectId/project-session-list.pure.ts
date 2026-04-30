import type { SessionStatus, SessionSummary } from '../../../../shared/acp.ts';

const normalizeQuery = (query: string): string => query.trim().toLocaleLowerCase('ja-JP');

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
    .join(' ')
    .toLocaleLowerCase('ja-JP');

export const sortSessionsNewestFirst = (
  sessions: readonly SessionSummary[],
): readonly SessionSummary[] =>
  [...sessions].sort((left, right) => {
    const statusOrder = { running: 0, paused: 1, inactive: 2 } as const satisfies Record<
      SessionStatus,
      number
    >;
    const statusComparison = statusOrder[left.status] - statusOrder[right.status];
    if (statusComparison !== 0) {
      return statusComparison;
    }

    const leftDate = left.updatedAt ?? left.createdAt;
    const rightDate = right.updatedAt ?? right.createdAt;
    return rightDate.localeCompare(leftDate);
  });

export const sessionTimestamp = (session: SessionSummary): string =>
  session.updatedAt ?? session.createdAt;

const sessionStatusLabels = {
  paused: 'Paused',
  running: 'Running',
  inactive: 'Inactive',
} as const satisfies Record<SessionStatus, string>;

const sessionStatusBadgeClassNames = {
  paused: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200',
  running: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200',
  inactive: 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-200',
} as const satisfies Record<SessionStatus, string>;

const sessionStatusRowClassNames = {
  paused:
    'border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/40 hover:bg-amber-500/[0.08]',
  running:
    'border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08]',
  inactive:
    'border-slate-400/35 bg-slate-500/[0.03] hover:border-slate-400/50 hover:bg-slate-500/[0.07] dark:border-slate-500/50 dark:bg-slate-500/[0.08]',
} as const satisfies Record<SessionStatus, string>;

const sessionStatusAccentClassNames = {
  paused: 'bg-amber-500',
  running: 'bg-emerald-500',
  inactive: 'bg-slate-400 dark:bg-slate-300',
} as const satisfies Record<SessionStatus, string>;

const loadableProviderPresetIds = new Set(['codex', 'claude-code', 'pi-coding-agent']);

export const sessionStatusLabel = (status: SessionStatus): string => sessionStatusLabels[status];

export const sessionStatusBadgeClassName = (status: SessionStatus): string =>
  sessionStatusBadgeClassNames[status];

export const sessionStatusRowClassName = (status: SessionStatus): string =>
  sessionStatusRowClassNames[status];

export const sessionStatusAccentClassName = (status: SessionStatus): string =>
  sessionStatusAccentClassNames[status];

export const isLoadableProviderPresetId = (presetId: string): boolean =>
  loadableProviderPresetIds.has(presetId);

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
