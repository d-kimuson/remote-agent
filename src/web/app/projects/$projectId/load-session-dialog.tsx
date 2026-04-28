import { ChevronDown, History, LoaderCircle } from "lucide-react";
import type { FC } from "react";

import type {
  AgentPreset,
  ResumableSessionCandidate,
  ResumeCapability,
} from "../../../../shared/acp.ts";
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
  readonly providerPresets: readonly AgentPreset[];
  readonly selectedProviderId: string | null;
  readonly capability: ResumeCapability | null;
  readonly sessions: readonly ResumableSessionCandidate[];
  readonly isLoading: boolean;
  readonly isLoadingSession: boolean;
  readonly error: Error | null;
  readonly onSelectProvider: (presetId: string) => void;
  readonly onLoadSession: (session: ResumableSessionCandidate) => void;
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
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Load session</DialogTitle>
        <DialogDescription>
          Select a provider, then choose a session from the current working directory.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 min-w-0 space-y-4 overflow-hidden">
        <div className="relative min-w-0">
          <select
            aria-label="読み込み provider"
            className="h-8 w-full appearance-none rounded-lg border border-input bg-background px-2.5 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            disabled={providerPresets.length === 0 || isLoadingSession}
            onChange={(event) => {
              if (event.target.value.length > 0) {
                onSelectProvider(event.target.value);
              }
            }}
            value={selectedProviderId ?? ""}
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
            <div
              className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-lg border p-4 sm:flex-row sm:items-center"
              key={session.sessionId}
            >
              <div className="min-w-0 max-w-full flex-1 space-y-1 overflow-hidden sm:w-0">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                  <History className="size-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 max-w-full flex-1 truncate font-medium">
                    {session.title ?? session.sessionId}
                  </p>
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
                className="w-full min-w-0 max-w-full overflow-hidden sm:w-64 sm:min-w-64"
                disabled={!session.loadable || isLoadingSession}
                onClick={() => {
                  onLoadSession(session);
                }}
                type="button"
                variant={session.loadable ? "default" : "outline"}
              >
                <span className="min-w-0 truncate">
                  {isLoadingSession ? "Loading..." : "Load session"}
                </span>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
