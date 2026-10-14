import { eq } from 'drizzle-orm';

import type { MessageResponse } from '../../../shared/acp.ts';

import { promptIdempotencyKeysTable } from '../../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../../db/sqlite.ts';

const normalizeIdempotencyKey = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0 || trimmed.length > 128) {
    return null;
  }
  return trimmed;
};

export const createPromptIdempotencyStore = (database: AppDatabase = getDefaultDatabase()) => {
  const getCachedResponse = async (key: string): Promise<MessageResponse | null> => {
    const normalized = normalizeIdempotencyKey(key);
    if (normalized === null) {
      return null;
    }

    const row = await database.db
      .select()
      .from(promptIdempotencyKeysTable)
      .where(eq(promptIdempotencyKeysTable.key, normalized))
      .get();

    if (row === undefined) {
      return null;
    }

    try {
      // Opaque cache of a previously successful API JSON body — do not
      // re-validate against evolving schemas (optional keys may be omitted).
      return JSON.parse(row.responseJson) as MessageResponse;
    } catch {
      return null;
    }
  };

  const saveResponse = async (
    key: string,
    sessionId: string,
    response: MessageResponse,
  ): Promise<void> => {
    const normalized = normalizeIdempotencyKey(key);
    if (normalized === null) {
      return;
    }

    await database.db
      .insert(promptIdempotencyKeysTable)
      .values({
        key: normalized,
        sessionId,
        responseJson: JSON.stringify(response),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
  };

  return {
    getCachedResponse,
    normalizeIdempotencyKey,
    saveResponse,
  };
};

export type PromptIdempotencyStore = ReturnType<typeof createPromptIdempotencyStore>;

let defaultStore: PromptIdempotencyStore | undefined;

export const getPromptIdempotencyStore = (): PromptIdempotencyStore => {
  defaultStore ??= createPromptIdempotencyStore();
  return defaultStore;
};

export const readIdempotencyKeyHeader = (headerValue: string | undefined): string | null =>
  getPromptIdempotencyStore().normalizeIdempotencyKey(headerValue);
