import { History, LoaderCircle } from "lucide-react";
import type { FC } from "react";

import type { ResumableSessionCandidate, ResumeCapability } from "../../../../shared/acp.ts";
import { Button } from "../../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.tsx";

const formatTimestamp = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    return "updatedAt unavailable";
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const LoadSessionDialog: FC<{
  readonly capability: ResumeCapability | null;
  readonly sessions: readonly ResumableSessionCandidate[];
  readonly isLoading: boolean;
  readonly isLoadingSession: boolean;
  readonly error: Error | null;
  readonly providerLabel: string;
  readonly onLoadSession: (session: ResumableSessionCandidate) => void;
  readonly onClose: () => void;
}> = ({
  capability,
  sessions,
  isLoading,
  isLoadingSession,
  error,
  providerLabel,
  onLoadSession,
  onClose,
}) => (
  <Dialog
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    open
  >
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Load {providerLabel} session</DialogTitle>
        <DialogDescription>Select a session from the current working directory.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading sessions...
          </div>
        ) : null}

        {error !== null ? <p className="text-sm text-destructive">{error.message}</p> : null}

        {capability?.fallbackReason !== null && capability?.fallbackReason !== undefined ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {capability.fallbackReason}
          </div>
        ) : null}

        {sessions.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No sessions found.
          </div>
        ) : null}

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {sessions.map((session) => (
            <div
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              key={session.sessionId}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <p className="truncate font-medium">{session.title ?? session.sessionId}</p>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {session.sessionId}
                </p>
                <p className="break-all text-xs text-muted-foreground">{session.cwd}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(session.updatedAt)}
                </p>
              </div>

              <Button
                disabled={!session.loadable || isLoadingSession}
                onClick={() => {
                  onLoadSession(session);
                }}
                type="button"
                variant={session.loadable ? "default" : "outline"}
              >
                {isLoadingSession ? "Loading..." : "Load session"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
