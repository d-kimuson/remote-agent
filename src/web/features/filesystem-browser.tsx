import { FileText, Folder, FolderOpen } from "lucide-react";
import type { FC } from "react";

import type { FilesystemEntry } from "../../shared/acp.ts";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";

type FilesystemBrowserProps = {
  readonly root: FilesystemEntry | null;
  readonly attachedFiles?: readonly string[];
  readonly selectedDirectoryPath?: string | null;
  readonly onOpenDirectory?: (path: string) => void;
  readonly onSelectDirectory?: (path: string) => void;
  readonly onToggleFile?: (path: string) => void;
};

export const FilesystemBrowser: FC<FilesystemBrowserProps> = ({
  root,
  attachedFiles = [],
  selectedDirectoryPath = null,
  onOpenDirectory,
  onSelectDirectory,
  onToggleFile,
}) => {
  if (root === null) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="size-4" />
          Root
        </div>
        <p className="break-all font-mono text-xs text-muted-foreground">{root.path}</p>
      </div>

      <div className="space-y-2">
        {(root.children ?? []).map((entry) => {
          const isSelectedDirectory =
            entry.kind === "directory" && selectedDirectoryPath === entry.path;
          const isAttachedFile = attachedFiles.includes(entry.path);

          return (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2",
                isSelectedDirectory ? "border-primary bg-primary/5" : "bg-background",
              )}
              key={entry.path}
            >
              {entry.kind === "directory" ? (
                <Folder className="size-4 text-muted-foreground" />
              ) : (
                <FileText className="size-4 text-muted-foreground" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{entry.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{entry.path}</p>
              </div>

              {entry.kind === "directory" ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      onSelectDirectory?.(entry.path);
                    }}
                    size="sm"
                    type="button"
                    variant={isSelectedDirectory ? "default" : "outline"}
                  >
                    Select
                  </Button>
                  <Button
                    onClick={() => {
                      onOpenDirectory?.(entry.path);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Open
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    onToggleFile?.(entry.path);
                  }}
                  size="sm"
                  type="button"
                  variant={isAttachedFile ? "default" : "outline"}
                >
                  {isAttachedFile ? "Attached" : "Attach"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
