import { describe, expect, test } from 'vitest';

import type { MessageResponse } from '../../../shared/acp.ts';

import { sessionsTable } from '../../db/schema.ts';
import { createMemoryDatabase } from '../../db/sqlite.ts';
import { createPromptIdempotencyStore } from './prompt-idempotency-store.ts';

const sampleResponse = (sessionId: string): MessageResponse => ({
  session: {
    sessionId,
    title: 'Test',
    status: 'inactive',
    origin: 'new',
    projectId: null,
    presetId: 'cursor-cli',
    command: 'agent',
    args: ['acp'],
    cwd: '/tmp',
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    isActive: true,
    currentModeId: null,
    currentModelId: null,
    availableModes: [],
    availableModels: [],
    configOptions: [],
  },
  text: 'ok',
  rawEvents: [],
});

describe('createPromptIdempotencyStore', () => {
  test('returns null for unknown or empty keys', async () => {
    const database = createMemoryDatabase();
    const store = createPromptIdempotencyStore(database);
    try {
      expect(await store.getCachedResponse('missing')).toBeNull();
      expect(store.normalizeIdempotencyKey('')).toBeNull();
      expect(store.normalizeIdempotencyKey('   ')).toBeNull();
      expect(store.normalizeIdempotencyKey('a'.repeat(129))).toBeNull();
    } finally {
      database.client.close();
    }
  });

  test('caches and returns the same response for a key', async () => {
    const database = createMemoryDatabase();
    const store = createPromptIdempotencyStore(database);
    const sessionId = 'session-idem-1';

    try {
      await database.db.insert(sessionsTable).values({
        sessionId,
        origin: 'new',
        projectId: null,
        presetId: 'cursor-cli',
        command: 'agent',
        argsJson: '["acp"]',
        cwd: '/tmp',
        createdAt: '2026-10-14T12:00:00.000Z',
        title: 'Test',
        updatedAt: '2026-10-14T12:00:00.000Z',
        currentModeId: null,
        currentModelId: null,
        availableModesJson: '[]',
        availableModelsJson: '[]',
        configOptionsJson: '[]',
      });

      const key = 'client-msg-abc';
      const response = sampleResponse(sessionId);
      await store.saveResponse(key, sessionId, response);

      expect(await store.getCachedResponse(key)).toEqual(response);
      // Second save with same key must not throw / overwrite path is fine via onConflictDoNothing
      await store.saveResponse(key, sessionId, { ...response, text: 'different' });
      expect((await store.getCachedResponse(key))?.text).toBe('ok');
    } finally {
      database.client.close();
    }
  });
});
