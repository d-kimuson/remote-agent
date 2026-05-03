import { describe, expect, test } from 'vitest';

import type { ProjectSandboxSettings, ProjectSettings, SessionSummary } from '../../shared/acp.ts';

import { createRoutineRunner } from './routine-runner.ts';

const baseSession: SessionSummary = {
  sessionId: 'session-routine',
  origin: 'new',
  status: 'paused',
  projectId: 'project-1',
  presetId: 'codex',
  command: 'codex-acp',
  args: [],
  cwd: '/work/project',
  createdAt: '2026-04-29T00:00:00.000Z',
  isActive: true,
  title: null,
  firstUserMessagePreview: null,
  updatedAt: '2026-04-29T00:00:00.000Z',
  currentModeId: 'workspace-write',
  currentModelId: 'gpt-5.4',
  availableModes: [],
  availableModels: [],
  configOptions: [],
};

const defaultProjectSandbox: ProjectSandboxSettings = {
  enabled: false,
  filesystem: {
    allowRead: [],
    denyRead: [],
    allowWrite: ['.'],
    denyWrite: [],
  },
  network: {
    mode: 'inherit',
    allowedDomains: [],
  },
};

const emptyProjectSettings: ProjectSettings = {
  projectId: 'project-1',
  modelPreferences: [],
  modePreferences: [],
  worktreeSetupScript: '',
  sandbox: defaultProjectSandbox,
};

describe('createRoutineRunner', () => {
  test('creates an agent session and sends the configured prompt', async () => {
    const createdSessions: unknown[] = [];
    const sentPrompts: unknown[] = [];
    const markedModels: unknown[] = [];
    const markedModes: unknown[] = [];
    const runner = createRoutineRunner({
      getProjectById: () =>
        Promise.resolve({
          id: 'project-1',
          name: 'Project',
          workingDirectory: '/work/project',
        }),
      getProjectSettingsById: () => Promise.resolve(emptyProjectSettings),
      markProjectModelUsed: (projectId, request) => {
        markedModels.push({ projectId, request });
        return Promise.resolve(emptyProjectSettings);
      },
      markProjectModeUsed: (projectId, request) => {
        markedModes.push({ projectId, request });
        return Promise.resolve(emptyProjectSettings);
      },
      createAgentSession: (options) => {
        createdSessions.push(options);
        return Promise.resolve(baseSession);
      },
      sendAgentPrompt: (sessionId, request) => {
        sentPrompts.push({ sessionId, request });
        return Promise.resolve({
          session: baseSession,
          text: 'done',
          rawEvents: [],
          assistantSegmentMessages: [],
        });
      },
    });

    await runner.runRoutine({
      id: 'routine-1',
      name: 'Daily',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * *' },
      sendConfig: {
        projectId: 'project-1',
        presetId: 'codex',
        cwd: null,
        modelId: 'gpt-5.4',
        modeId: 'workspace-write',
        prompt: 'Run daily task.',
      },
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      lastRunAt: null,
      nextRunAt: '2026-04-29T09:00:00.000Z',
      lastError: null,
    });

    expect(createdSessions).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        command: 'codex-acp',
        cwd: '/work/project',
        initialModelId: 'gpt-5.4',
        initialModeId: 'workspace-write',
      }),
    ]);
    expect(sentPrompts).toEqual([
      {
        sessionId: 'session-routine',
        request: {
          prompt: 'Run daily task.',
          modelId: 'gpt-5.4',
          modeId: 'workspace-write',
        },
      },
    ]);
    expect(markedModels).toEqual([
      {
        projectId: 'project-1',
        request: {
          presetId: 'codex',
          modelId: 'gpt-5.4',
          markLastUsed: true,
        },
      },
    ]);
    expect(markedModes).toEqual([
      {
        projectId: 'project-1',
        request: {
          presetId: 'codex',
          modeId: 'workspace-write',
          markLastUsed: true,
        },
      },
    ]);
  });

  test('passes routine attachment ids to the prompt request', async () => {
    const sentPrompts: unknown[] = [];
    const runner = createRoutineRunner({
      getProjectById: () =>
        Promise.resolve({
          id: 'project-1',
          name: 'Project',
          workingDirectory: '/work/project',
        }),
      getProjectSettingsById: () => Promise.resolve(emptyProjectSettings),
      markProjectModelUsed: () => Promise.resolve(emptyProjectSettings),
      markProjectModeUsed: () => Promise.resolve(emptyProjectSettings),
      createAgentSession: () => Promise.resolve(baseSession),
      sendAgentPrompt: (sessionId, request) => {
        sentPrompts.push({ sessionId, request });
        return Promise.resolve({
          session: baseSession,
          text: 'done',
          rawEvents: [],
          assistantSegmentMessages: [],
        });
      },
    });

    await runner.runRoutine({
      id: 'routine-attachment',
      name: 'With attachment',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * *' },
      sendConfig: {
        projectId: 'project-1',
        presetId: 'codex',
        cwd: null,
        prompt: 'Read this file.',
        attachments: [
          {
            attachmentId: 'attachment-1',
            name: 'note.txt',
            mediaType: 'text/plain',
            sizeInBytes: 12,
          },
        ],
      },
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      lastRunAt: null,
      nextRunAt: '2026-04-29T09:00:00.000Z',
      lastError: null,
    });

    expect(sentPrompts).toEqual([
      {
        sessionId: 'session-routine',
        request: {
          prompt: 'Read this file.',
          attachmentIds: ['attachment-1'],
          attachments: [
            {
              attachmentId: 'attachment-1',
              name: 'note.txt',
              mediaType: 'text/plain',
              sizeInBytes: 12,
            },
          ],
          modelId: null,
          modeId: null,
        },
      },
    ]);
  });

  test('uses the project last-used mode when a routine omits modeId', async () => {
    const createdSessions: unknown[] = [];
    const settings: ProjectSettings = {
      projectId: 'project-1',
      modelPreferences: [],
      worktreeSetupScript: '',
      sandbox: defaultProjectSandbox,
      modePreferences: [
        {
          presetId: 'codex',
          modeId: 'read-only',
          lastUsedAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        },
        {
          presetId: 'codex',
          modeId: 'workspace-write',
          lastUsedAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
        },
      ],
    };
    const runner = createRoutineRunner({
      getProjectById: () =>
        Promise.resolve({
          id: 'project-1',
          name: 'Project',
          workingDirectory: '/work/project',
        }),
      getProjectSettingsById: () => Promise.resolve(settings),
      markProjectModelUsed: () => Promise.resolve(settings),
      markProjectModeUsed: () => Promise.resolve(settings),
      createAgentSession: (options) => {
        createdSessions.push(options);
        return Promise.resolve(baseSession);
      },
      sendAgentPrompt: () =>
        Promise.resolve({
          session: baseSession,
          text: 'done',
          rawEvents: [],
          assistantSegmentMessages: [],
        }),
    });

    await runner.runRoutine({
      id: 'routine-1',
      name: 'Daily',
      enabled: true,
      kind: 'cron',
      config: { cronExpression: '0 9 * * *' },
      sendConfig: {
        projectId: 'project-1',
        presetId: 'codex',
        cwd: null,
        modelId: null,
        modeId: null,
        prompt: 'Run daily task.',
      },
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      lastRunAt: null,
      nextRunAt: '2026-04-29T09:00:00.000Z',
      lastError: null,
    });

    expect(createdSessions).toEqual([
      expect.objectContaining({
        initialModeId: 'workspace-write',
      }),
    ]);
  });
});
