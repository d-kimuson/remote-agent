import { Paperclip, X } from "lucide-react";
import { useState, type FC } from "react";
import { useMutation } from "@tanstack/react-query";

import type { FilesystemEntry } from "../../../../shared/acp.ts";
import { FilesystemBrowser } from "../../../features/filesystem-browser.tsx";
import { Badge } from "../../../components/ui/badge.tsx";
import { Button } from "../../../components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { ScrollArea } from "../../../components/ui/scroll-area.tsx";
import { fetchFilesystemTree } from "../../../lib/api/acp.ts";

export const AttachFilesDialog: FC<{
  readonly attachedFiles: readonly string[];
  readonly onToggleFile: (path: string) => void;
  readonly workingDirectory: string | null;
  readonly onClose: () => void;
}> = ({ attachedFiles, onToggleFile, workingDirectory, onClose }) => {
  const [browserRootPath, setBrowserRootPath] = useState("");
  const [filesystemRoot, setFilesystemRoot] = useState<FilesystemEntry | null>(null);

  const loadTreeMutation = useMutation({
    mutationFn: (root: string) => fetchFilesystemTree(root),
    onSuccess: (data) => {
      setFilesystemRoot(data.root);
    },
  });

  const handleLoad = () => {
    const root = browserRootPath.length > 0 ? browserRootPath : (workingDirectory ?? "");
    loadTreeMutation.mutate(root);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="flex h-[80vh] w-full max-w-3xl flex-col">
        <CardHeader>
          <CardTitle>Attach files</CardTitle>
          <CardDescription>prompt にファイルパスを添付します。</CardDescription>
          <CardAction>
            <Button onClick={onClose} size="sm" type="button" variant="outline">
              <X className="size-4" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex gap-2">
            <Input
              onChange={(event) => {
                setBrowserRootPath(event.target.value);
              }}
              placeholder={workingDirectory ?? "/path/to/project"}
              value={browserRootPath}
            />
            <Button
              disabled={loadTreeMutation.isPending}
              onClick={handleLoad}
              type="button"
              variant="outline"
            >
              Load
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 rounded-lg border p-4">
            <FilesystemBrowser
              attachedFiles={attachedFiles}
              onOpenDirectory={setBrowserRootPath}
              onToggleFile={onToggleFile}
              root={filesystemRoot}
            />
          </ScrollArea>

          <div className="flex flex-wrap gap-2">
            {attachedFiles.length === 0 ? <Badge variant="outline">No attached file</Badge> : null}
            {attachedFiles.map((path) => (
              <Badge key={path} variant="secondary">
                <Paperclip className="size-3" />
                {path}
              </Badge>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose} type="button">
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
