import type { FC } from 'react';

import type { SessionSummary } from '../../../../shared/acp.ts';
import type { DraftSession } from './chat-state.pure.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { cn } from '../../../lib/utils.ts';
import { sessionStatusBadgeClassName, sessionStatusLabel } from './project-session-list.pure.ts';

export const SessionListItem: FC<{
  readonly session:
    | {
        readonly kind: 'draft';
        readonly draft: DraftSession;
      }
    | {
        readonly kind: 'existing';
        readonly session: SessionSummary;
      };
  readonly listTitle: string;
  readonly footerLeft: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}> = ({ session, listTitle, footerLeft, selected, onSelect }) => {
  const subtitle =
    session.kind === 'draft'
      ? session.draft.cwd
      : (session.session.currentModelId ?? session.session.cwd);

  const badgeLabel =
    session.kind === 'draft' ? session.draft.label : (session.session.presetId ?? 'custom');
  const statusLabel =
    session.kind === 'draft' ? 'Draft' : sessionStatusLabel(session.session.status);
  const statusClassName =
    session.kind === 'draft' ? '' : sessionStatusBadgeClassName(session.session.status);

  return (
    <button
      className={cn(
        'w-full rounded-lg border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-primary/50 bg-primary/[0.08]'
          : 'bg-background/70 hover:border-foreground/15 hover:bg-background',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium tracking-[0.01em]">{listTitle}</p>
            <Badge
              className={statusClassName}
              variant={session.kind === 'draft' ? 'secondary' : 'outline'}
            >
              {statusLabel}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="outline">{badgeLabel}</Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <p className="min-w-0 truncate">{footerLeft}</p>
        <p className="shrink-0">{selected ? 'active' : 'open'}</p>
      </div>
    </button>
  );
};
