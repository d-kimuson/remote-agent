import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { UploadedAttachment } from '../../shared/acp.ts';

export type ResolvedAttachment = UploadedAttachment & {
  readonly storedPath: string;
};

type AttachmentEntry = ResolvedAttachment & {
  readonly createdAt: string;
};

const attachmentStore = new Map<string, AttachmentEntry>();
const uploadsDirectory = path.join(tmpdir(), 'remote-agent-attachments');

const normalizeAttachmentName = (name: string): string => {
  const normalizedName = path.basename(name).trim();
  return normalizedName.length > 0 ? normalizedName : 'attachment';
};

const toStoredFilename = (attachmentId: string, name: string): string => {
  const normalizedName = normalizeAttachmentName(name)
    .replaceAll('/', '_')
    .replaceAll('\\', '_')
    .replaceAll('\u0000', '');

  return `${attachmentId}-${normalizedName.length > 0 ? normalizedName : 'attachment'}`;
};

const toUploadedAttachment = (entry: AttachmentEntry): UploadedAttachment => {
  return {
    attachmentId: entry.attachmentId,
    name: entry.name,
    mediaType: entry.mediaType,
    sizeInBytes: entry.sizeInBytes,
  };
};

export const ingestAttachments = async (
  files: readonly File[],
): Promise<readonly UploadedAttachment[]> => {
  if (files.length === 0) {
    throw new Error('files are required');
  }

  await mkdir(uploadsDirectory, { recursive: true });

  const attachments: UploadedAttachment[] = [];

  for (const file of files) {
    const attachmentId = randomUUID();
    const name = normalizeAttachmentName(file.name);
    const mediaType = file.type.trim().length > 0 ? file.type : 'application/octet-stream';
    const storedPath = path.join(uploadsDirectory, toStoredFilename(attachmentId, name));

    await writeFile(storedPath, Buffer.from(await file.arrayBuffer()));

    const entry: AttachmentEntry = {
      attachmentId,
      name,
      mediaType,
      sizeInBytes: file.size,
      storedPath,
      createdAt: new Date().toISOString(),
    };

    attachmentStore.set(attachmentId, entry);
    attachments.push(toUploadedAttachment(entry));
  }

  return attachments;
};

export const resolveAttachments = (
  attachmentIds: readonly string[],
): readonly ResolvedAttachment[] => {
  const attachments: ResolvedAttachment[] = [];

  for (const attachmentId of attachmentIds) {
    const entry = attachmentStore.get(attachmentId);
    if (entry === undefined) {
      throw new Error(`Unknown attachment: ${attachmentId}`);
    }

    attachments.push({
      attachmentId: entry.attachmentId,
      name: entry.name,
      mediaType: entry.mediaType,
      sizeInBytes: entry.sizeInBytes,
      storedPath: entry.storedPath,
    });
  }

  return attachments;
};

export const listStoredAttachments = (): readonly ResolvedAttachment[] => {
  return [...attachmentStore.values()].map((entry) => ({
    attachmentId: entry.attachmentId,
    name: entry.name,
    mediaType: entry.mediaType,
    sizeInBytes: entry.sizeInBytes,
    storedPath: entry.storedPath,
  }));
};
