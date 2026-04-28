import { ChevronDown, History, LoaderCircle } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import type {
  AgentPreset,
  ResumableSessionCandidate,
  ResumeCapability,
} from '../../../../shared/acp.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.tsx';

const formatTimestamp = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    return 'updatedAt unavailable';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const LoadSessionDialog: FC<{
  readonly providerPresets: readonly AgentPreset[];
  readonly selectedProviderId: string | null;
  readonly capability: ResumeCapability | null;
  readonly sessions: readonly ResumableSessionCandidate[];
  readonly isLoading: boolean;
  readonly isLoadingSession: boolean;
  readonly error: Error | null;
  readonly onSelectProvider: (presetId: string) => void;
  readonly onLoadSessions: (sessions: readonly ResumableSessionCandidate[]) => void;
  readonly onClose: () => void;
}> = ({
  providerPresets,
  selectedProviderId,
  capability,
  sessions,
  isLoading,
  isLoadingSession,
  error,
  onSelectProvider,
  onLoadSessions,
  onClose,
}) => {
  const [selectedSessionIds, setSelectedSessionIds] = useState<ReadonlySet<string>>(new Set());
  const loadableSessions = useMemo(
    () => sessions.filter((session) => session.loadable),
    [sessions],
  );
  const selectedSessions = useMemo(
    () => sessions.filter((session) => selectedSessionIds.has(session.sessionId)),
    [selectedSessionIds, sessions],
  );
  const allLoadableSelected =
    loadableSessions.length > 0 &&
    loadableSessions.every((session) => selectedSessionIds.has(session.sessionId));

  const toggleSession = (sessionId: string, checked: boolean): void => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  };

  const toggleAllLoadable = (checked: boolean): void => {
    setSelectedSessionIds(
      checked ? new Set(loadableSessions.map((session) => session.sessionId)) : new Set(),
    );
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load session</DialogTitle>
          <DialogDescription>Select a provider, then choose sessions to import.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 space-y-4 overflow-hidden">
          <div className="relative min-w-0">
            <select
              aria-label="読み込み provider"
              className="h-8 w-full appearance-none rounded-lg border border-input bg-background px-2.5 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              disabled={providerPresets.length === 0 || isLoadingSession}
              onChange={(event) => {
                if (event.target.value.length > 0) {
                  setSelectedSessionIds(new Set());
                  onSelectProvider(event.target.value);
                }
              }}
              value={selectedProviderId ?? ''}
            >
              <option disabled value="">
                Provider
              </option>
              {providerPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {sessions.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <label
                className="flex min-w-0 cursor-pointer items-center gap-3 text-sm"
                htmlFor="load-session-select-all"
              >
                <Checkbox
                  checked={allLoadableSelected}
                  disabled={isLoadingSession || loadableSessions.length === 0}
                  id="load-session-select-all"
                  onCheckedChange={(checked) => {
                    toggleAllLoadable(checked === true);
                  }}
                />
                <span className="min-w-0 truncate">Select all</span>
              </label>
              <Button
                className="w-full sm:w-64"
                disabled={selectedSessions.length === 0 || isLoadingSession}
                onClick={() => {
                  onLoadSessions(selectedSessions);
                }}
                type="button"
              >
                {isLoadingSession
                  ? 'Loading...'
                  : `Load Selected Items (${selectedSessions.length})`}
              </Button>
            </div>
          ) : null}

          <div className="h-[50dvh] min-w-0 max-w-full space-y-2 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading sessions...
              </div>
            ) : null}

            {error !== null ? (
              <div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                {error.message}
              </div>
            ) : null}

            {capability?.fallbackReason !== null && capability?.fallbackReason !== undefined ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {capability.fallbackReason}
              </div>
            ) : null}

            {selectedProviderId === null ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Select a provider to load sessions.
              </div>
            ) : null}

            {selectedProviderId !== null && sessions.length === 0 && !isLoading ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No sessions found.
              </div>
            ) : null}

            {sessions.map((session) => (
              <label
                className="flex min-w-0 max-w-full cursor-pointer gap-3 overflow-hidden rounded-lg border p-4"
                htmlFor={`load-session-${session.sessionId}`}
                key={session.sessionId}
              >
                <Checkbox
                  checked={selectedSessionIds.has(session.sessionId)}
                  disabled={!session.loadable || isLoadingSession}
                  id={`load-session-${session.sessionId}`}
                  onCheckedChange={(checked) => {
                    toggleSession(session.sessionId, checked === true);
                  }}
                />
                <div className="min-w-0 max-w-full flex-1 space-y-1 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <History className="size-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 max-w-full flex-1 truncate font-medium">
                      {session.title ?? session.sessionId}
                    </p>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {session.sessionId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(session.updatedAt)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
