import { afterEach, describe, expect, test } from 'vitest';

import { createMemoryDatabase } from '../db/sqlite.ts';
import { createRoutineStore } from './routine-store.ts';

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createRoutineStore', () => {
  test('persists cron routines with send config', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);
    const store = createRoutineStore(database);

    const routine = await store.createRoutine({
      name: 'Daily standup',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * 1-5' },
      sendConfig: {
        projectId: 'remote-agent',
        presetId: 'codex',
        cwd: null,
        modelId: 'gpt-5.4',
        modeId: 'workspace-write',
        prompt: 'Summarize current TODO.',
      },
    });

    expect(routine).toMatchObject({
      name: 'Daily standup',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * 1-5' },
    });
    expect(typeof routine.nextRunAt).toBe('string');

    await expect(store.listRoutines()).resolves.toEqual([routine]);
  });

  test('disables scheduled routines after successful completion', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);
    const store = createRoutineStore(database);

    const routine = await store.createRoutine({
      name: 'One shot',
      kind: 'scheduled',
      config: { runAt: '2026-04-29T10:00:00.000Z' },
      sendConfig: {
        projectId: null,
        presetId: 'codex',
        cwd: '/tmp/project',
        modelId: null,
        modeId: null,
        prompt: 'Run this once.',
      },
    });
    const completed = await store.markRoutineRunCompleted({
      routineId: routine.id,
      runAt: new Date('2026-04-29T10:01:00.000Z'),
      error: null,
    });

    expect(completed).toMatchObject({
      enabled: false,
      lastRunAt: '2026-04-29T10:01:00.000Z',
      nextRunAt: null,
      lastError: null,
    });
  });
});
