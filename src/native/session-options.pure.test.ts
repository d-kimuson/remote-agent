import { describe, expect, test } from 'vitest';

import type { AgentProviderStatus } from '../shared/acp.ts';

import {
  defaultPresetId,
  enabledProviderPresets,
  optionDisplayName,
  preferredModeIds,
  preferredModelIds,
  resolveSelectableOptionId,
  routineRequestFromDraft,
  scheduleValueFromRoutine,
  worktreeRequestFromDraft,
} from './session-options.pure.ts';

const providers = [
  {
    preset: {
      id: 'other',
      label: 'Other',
      description: '',
      command: 'other',
      args: [],
    },
    enabled: false,
    enabledAt: null,
    updatedAt: null,
  },
  {
    preset: {
      id: 'codex',
      label: 'Codex',
      description: '',
      command: 'codex',
      args: [],
    },
    enabled: true,
    enabledAt: null,
    updatedAt: null,
  },
] satisfies readonly AgentProviderStatus[];

describe('native session options', () => {
  test('enabledProviderPresets returns only enabled presets', () => {
    expect(enabledProviderPresets(providers).map((preset) => preset.id)).toEqual(['codex']);
  });

  test('defaultPresetId prefers codex', () => {
    expect(defaultPresetId(enabledProviderPresets(providers))).toBe('codex');
  });

  test('resolveSelectableOptionId prefers explicit id when available', () => {
    expect(
      resolveSelectableOptionId({
        explicitId: 'b',
        currentId: 'a',
        options: [
          { id: 'a', name: 'A', description: null },
          { id: 'b', name: 'B', description: null },
        ],
      }),
    ).toBe('b');
  });

  test('resolveSelectableOptionId falls back to current then first option', () => {
    const options = [
      { id: 'a', name: 'A', description: null },
      { id: 'b', name: 'B', description: null },
    ];
    expect(resolveSelectableOptionId({ explicitId: 'missing', currentId: 'b', options })).toBe('b');
    expect(resolveSelectableOptionId({ explicitId: null, currentId: 'missing', options })).toBe(
      'a',
    );
  });

  test('resolveSelectableOptionId uses project preferences before first option', () => {
    expect(
      resolveSelectableOptionId({
        explicitId: null,
        currentId: null,
        preferredIds: ['missing', 'b'],
        options: [
          { id: 'a', name: 'A', description: null },
          { id: 'b', name: 'B', description: null },
        ],
      }),
    ).toBe('b');
  });

  test('optionDisplayName falls back to id', () => {
    expect(optionDisplayName({ id: 'model-id', name: '', description: null })).toBe('model-id');
  });

  test('preferredModelIds returns last-used models before favorites for a preset', () => {
    expect(
      preferredModelIds(
        [
          {
            presetId: 'codex',
            modelId: 'favorite',
            isFavorite: true,
            lastUsedAt: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            presetId: 'codex',
            modelId: 'recent',
            isFavorite: false,
            lastUsedAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          {
            presetId: 'other',
            modelId: 'other-model',
            isFavorite: true,
            lastUsedAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
          },
        ],
        'codex',
      ),
    ).toEqual(['recent', 'favorite']);
  });

  test('preferredModeIds returns last-used modes for a preset', () => {
    expect(
      preferredModeIds(
        [
          {
            presetId: 'codex',
            modeId: 'old',
            lastUsedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            presetId: 'codex',
            modeId: 'new',
            lastUsedAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        'codex',
      ),
    ).toEqual(['new', 'old']);
  });

  test('worktreeRequestFromDraft trims optional fields', () => {
    expect(
      worktreeRequestFromDraft({
        name: ' feature-a ',
        branchName: ' branch-a ',
        baseRef: ' ',
      }),
    ).toEqual({ name: 'feature-a', branchName: 'branch-a' });
    expect(worktreeRequestFromDraft({ name: ' ', branchName: '', baseRef: '' })).toBeNull();
  });

  test('routineRequestFromDraft builds scheduled and cron requests', () => {
    expect(
      routineRequestFromDraft({
        name: ' nightly ',
        enabled: true,
        kind: 'cron',
        scheduleValue: '0 9 * * *',
        projectId: 'project-1',
        presetId: 'codex',
        cwd: '/repo',
        modelId: 'gpt-5',
        modeId: 'workspace-write',
        prompt: ' run checks ',
      }),
    ).toEqual({
      name: 'nightly',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * *' },
      sendConfig: {
        projectId: 'project-1',
        presetId: 'codex',
        cwd: '/repo',
        modelId: 'gpt-5',
        modeId: 'workspace-write',
        prompt: 'run checks',
      },
    });
    expect(
      routineRequestFromDraft({
        name: '',
        enabled: true,
        kind: 'scheduled',
        scheduleValue: '2026-01-01T00:00:00.000Z',
        projectId: null,
        presetId: 'codex',
        cwd: null,
        modelId: null,
        modeId: null,
        prompt: 'run',
      }),
    ).toBeNull();
  });

  test('scheduleValueFromRoutine reads the matching config shape', () => {
    expect(
      scheduleValueFromRoutine({
        id: 'r1',
        name: 'cron',
        enabled: true,
        kind: 'cron',
        config: { cronExpression: '0 9 * * *' },
        sendConfig: {
          projectId: null,
          presetId: 'codex',
          cwd: null,
          modelId: null,
          modeId: null,
          prompt: 'run',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastRunAt: null,
        nextRunAt: null,
        lastError: null,
      }),
    ).toBe('0 9 * * *');
  });
});
