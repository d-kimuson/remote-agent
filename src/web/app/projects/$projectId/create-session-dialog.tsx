import { MessageSquare, X } from "lucide-react";
import type { FC } from "react";

import type { AgentPreset } from "../../../../shared/acp.ts";
import { Button } from "../../../components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx";

export const CreateSessionDialog: FC<{
  readonly presets: readonly AgentPreset[];
  readonly presetId: string;
  readonly onPresetIdChange: (id: string) => void;
  readonly isLoading: boolean;
  readonly isProjectReady: boolean;
  readonly error: Error | null;
  readonly onCreateSession: () => void;
  readonly onClose: () => void;
}> = ({
  presets,
  presetId,
  onPresetIdChange,
  isLoading,
  isProjectReady,
  error,
  onCreateSession,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>New Session</CardTitle>
        <CardDescription>provider を選んで ACP session を追加します。</CardDescription>
        <CardAction>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            <X className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Provider</p>
          <Select
            onValueChange={(value) => {
              if (value !== null) {
                onPresetIdChange(value);
              }
            }}
            value={presetId}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets
                .filter((preset) => ["codex", "pi", "custom"].includes(preset.id))
                .map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {error !== null ? <p className="text-sm text-destructive">{error.message}</p> : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!isProjectReady || isLoading} onClick={onCreateSession} type="button">
            <MessageSquare className="size-4" />
            {isLoading ? "Connecting..." : "Create session"}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);
