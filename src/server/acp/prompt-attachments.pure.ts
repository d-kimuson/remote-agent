import type { ResolvedAttachment } from '../attachments/store.ts';

export type AttachmentPromptCapabilities = {
  readonly image: boolean;
  readonly resourceLink: boolean;
  readonly embeddedContext: boolean;
};

export type AttachmentPromptDelivery = {
  readonly attachmentId: string;
  readonly name: string;
  readonly mediaType: string;
  readonly sizeInBytes: number;
  readonly storedPath: string;
  readonly kind: 'image' | 'resource_link_fallback' | 'text_fallback';
};

export type AttachmentPromptPlan = {
  readonly promptText: string;
  readonly deliveries: readonly AttachmentPromptDelivery[];
};

export const acpAiProviderAttachmentCapabilities = {
  embeddedContext: false,
  image: true,
  resourceLink: false,
} as const satisfies AttachmentPromptCapabilities;

const formatSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${String(sizeInBytes)} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KiB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const attachmentDeliveryKind = (
  attachment: ResolvedAttachment,
  capabilities: AttachmentPromptCapabilities,
): AttachmentPromptDelivery['kind'] => {
  if (capabilities.image && attachment.mediaType.startsWith('image/')) {
    return 'image';
  }

  if (capabilities.resourceLink) {
    return 'resource_link_fallback';
  }

  return 'text_fallback';
};

const attachmentMetadataLine = (attachment: ResolvedAttachment): string =>
  `- ${attachment.name} (${attachment.mediaType}, ${formatSize(attachment.sizeInBytes)}): ${attachment.storedPath}`;

const buildFallbackPromptText = ({
  attachments,
  prompt,
}: {
  readonly attachments: readonly ResolvedAttachment[];
  readonly prompt: string;
}): string => {
  if (attachments.length === 0) {
    return prompt;
  }

  const attachmentLines = attachments.map(attachmentMetadataLine);

  return `${prompt}\n\nAttached files:\n${attachmentLines.join('\n')}\n\nThe attached files were uploaded from the browser and are available at the local paths above. Read them from disk if you need their contents.`;
};

export const buildAttachmentPromptPlan = ({
  attachments,
  capabilities,
  prompt,
}: {
  readonly attachments: readonly ResolvedAttachment[];
  readonly capabilities: AttachmentPromptCapabilities;
  readonly prompt: string;
}): AttachmentPromptPlan => ({
  promptText: buildFallbackPromptText({ attachments, prompt }),
  deliveries: attachments.map((attachment) => ({
    attachmentId: attachment.attachmentId,
    name: attachment.name,
    mediaType: attachment.mediaType,
    sizeInBytes: attachment.sizeInBytes,
    storedPath: attachment.storedPath,
    kind: attachmentDeliveryKind(attachment, capabilities),
  })),
});

export const buildPromptWithAttachments = ({
  attachments,
  prompt,
}: {
  readonly attachments: readonly ResolvedAttachment[];
  readonly prompt: string;
}): string =>
  buildAttachmentPromptPlan({
    attachments,
    capabilities: {
      embeddedContext: false,
      image: false,
      resourceLink: false,
    },
    prompt,
  }).promptText;
