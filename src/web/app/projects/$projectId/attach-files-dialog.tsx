import type { ChangeEvent, FC } from 'react';

import { Paperclip } from 'lucide-react';

import type { UploadedAttachment } from '../../../../shared/acp.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { ScrollArea } from '../../../components/ui/scroll-area.tsx';

const formatSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${String(sizeInBytes)} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KiB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MiB`;
};

export const AttachFilesDialog: FC<{
  readonly attachedFiles: readonly UploadedAttachment[];
  readonly error: Error | null;
  readonly isUploading: boolean;
  readonly onAttachFiles: (files: readonly File[]) => Promise<void>;
  readonly onClose: () => void;
  readonly onRemoveFile: (attachmentId: string) => void;
}> = ({ attachedFiles, error, isUploading, onAttachFiles, onClose, onRemoveFile }) => {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList === null || fileList.length === 0) {
      return;
    }

    void onAttachFiles([...fileList]);
    event.target.value = '';
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
      <DialogContent className="flex max-h-[82vh] max-w-3xl grid-rows-none flex-col">
        <DialogHeader>
          <DialogTitle>Attach files</DialogTitle>
          <DialogDescription>Choose files to include with the next message.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="space-y-2">
            <Input multiple onChange={handleFileChange} type="file" />
          </div>

          <ScrollArea className="min-h-64 rounded-lg border p-4">
            <div className="space-y-3">
              {attachedFiles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No files attached.
                </div>
              ) : null}

              {attachedFiles.map((attachment) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  key={attachment.attachmentId}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Paperclip className="size-4 shrink-0" />
                      <p className="truncate text-sm font-medium">{attachment.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {attachment.mediaType} / {formatSize(attachment.sizeInBytes)}
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      onRemoveFile(attachment.attachmentId);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex flex-wrap gap-2">
            {attachedFiles.length === 0 ? <Badge variant="outline">No attached file</Badge> : null}
            {attachedFiles.map((attachment) => (
              <Badge key={attachment.attachmentId} variant="secondary">
                <Paperclip className="size-3" />
                {attachment.name}
              </Badge>
            ))}
          </div>

          {error === null ? null : <p className="text-sm text-destructive">{error.message}</p>}
        </div>
        <DialogFooter>
          <Button disabled={isUploading} onClick={onClose} type="button">
            {isUploading ? 'Uploading...' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
