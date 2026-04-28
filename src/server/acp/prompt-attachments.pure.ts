import type { ResolvedAttachment } from '../attachments/store.ts';

const formatSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${String(sizeInBytes)} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KiB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MiB`;
};

export const buildPromptWithAttachments = ({
  attachments,
  prompt,
}: {
  readonly attachments: readonly ResolvedAttachment[];
  readonly prompt: string;
}): string => {
  if (attachments.length === 0) {
    return prompt;
  }

  const attachmentLines = attachments.map((attachment) => {
    return `- ${attachment.name} (${attachment.mediaType}, ${formatSize(attachment.sizeInBytes)}): ${attachment.storedPath}`;
  });

  return `${prompt}\n\nAttached files:\n${attachmentLines.join('\n')}\n\nThe attached files were uploaded from the browser and are available at the local paths above. Read them from disk if you need their contents.`;
};
