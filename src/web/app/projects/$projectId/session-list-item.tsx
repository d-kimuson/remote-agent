import type { FC } from "react";

import type { SessionSummary } from "../../../../shared/acp.ts";
import { Badge } from "../../../components/ui/badge.tsx";
import { cn } from "../../../lib/utils.ts";

export const SessionListItem: FC<{
  readonly session: SessionSummary;
  readonly selected: boolean;
  readonly onSelect: (sessionId: string) => void;
}> = ({ session, selected, onSelect }) => (
  <button
    className={cn(
      "w-full rounded-lg border p-3 text-left transition-colors",
      selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50",
    )}
    onClick={() => {
      onSelect(session.sessionId);
    }}
    type="button"
  >
    <div className="flex items-center justify-between gap-2">
      <p className="truncate font-medium">{session.command}</p>
      <Badge variant="outline">{session.presetId ?? "custom"}</Badge>
    </div>
    <p className="mt-2 font-mono text-xs text-muted-foreground">{session.sessionId}</p>
    <p className="mt-1 truncate text-xs text-muted-foreground">
      {session.currentModelId ?? "default model"}
    </p>
  </button>
);
