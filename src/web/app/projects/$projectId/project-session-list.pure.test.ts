import { describe, expect, test } from 'vitest';

import type { SessionSummary } from '../../../../shared/acp.ts';

import {
  filterSessionsByQuery,
  sessionStatusBadgeClassName,
  sessionStatusLabel,
  sessionStatusRowClassName,
  sessionTimestamp,
  sortSessionsNewestFirst,
} from './project-session-list.pure.ts';

const session = {
  sessionId: 'session-1',
  origin: 'new',
  status: 'paused',
  projectId: 'project-1',
  presetId: 'codex',
  command: 'codex',
  args: [],
  cwd: '/tmp/remote-agent',
  createdAt: '2026-04-27T12:00:00.000Z',
  isActive: true,
  title: null,
  firstUserMessagePreview: null,
  updatedAt: null,
  currentModeId: null,
  currentModelId: null,
  availableModes: [],
  availableModels: [],
} satisfies SessionSummary;

describe('project-session-list.pure', () => {
  test('filterSessionsByQuery searches session title, preview, cwd, and ids', () => {
    const sessions = [
      { ...session, sessionId: 'alpha', title: 'Release notes' },
      { ...session, sessionId: 'beta', firstUserMessagePreview: 'Fix mobile menu' },
    ] satisfies readonly SessionSummary[];

    expect(filterSessionsByQuery({ sessions, query: 'mobile' }).map((s) => s.sessionId)).toEqual([
      'beta',
    ]);
    expect(
      filterSessionsByQuery({ sessions, query: 'REMOTE-AGENT' }).map((s) => s.sessionId),
    ).toEqual(['alpha', 'beta']);
    expect(filterSessionsByQuery({ sessions, query: ' ' }).map((s) => s.sessionId)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  test('sortSessionsNewestFirst prefers updatedAt', () => {
    const sessions = [
      { ...session, sessionId: 'old', createdAt: '2026-04-27T12:00:00.000Z' },
      {
        ...session,
        sessionId: 'updated',
        createdAt: '2026-04-20T12:00:00.000Z',
        updatedAt: '2026-04-28T12:00:00.000Z',
      },
      { ...session, sessionId: 'new', createdAt: '2026-04-28T10:00:00.000Z' },
    ] satisfies readonly SessionSummary[];

    expect(sortSessionsNewestFirst(sessions).map((s) => s.sessionId)).toEqual([
      'updated',
      'new',
      'old',
    ]);
  });

  test('sortSessionsNewestFirst groups by running, paused, inactive before timestamp', () => {
    const sessions = [
      {
        ...session,
        sessionId: 'inactive-new',
        status: 'inactive',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      {
        ...session,
        sessionId: 'paused-old',
        status: 'paused',
        createdAt: '2026-04-27T12:00:00.000Z',
      },
      {
        ...session,
        sessionId: 'running-old',
        status: 'running',
        createdAt: '2026-04-26T12:00:00.000Z',
      },
      {
        ...session,
        sessionId: 'paused-new',
        status: 'paused',
        createdAt: '2026-04-28T10:00:00.000Z',
      },
    ] satisfies readonly SessionSummary[];

    expect(sortSessionsNewestFirst(sessions).map((s) => s.sessionId)).toEqual([
      'running-old',
      'paused-new',
      'paused-old',
      'inactive-new',
    ]);
  });

  test('sessionTimestamp prefers updatedAt', () => {
    expect(
      sessionTimestamp({
        ...session,
        createdAt: '2026-04-27T12:00:00.000Z',
        updatedAt: '2026-04-28T12:00:00.000Z',
      }),
    ).toBe('2026-04-28T12:00:00.000Z');
    expect(sessionTimestamp({ ...session, updatedAt: null })).toBe('2026-04-27T12:00:00.000Z');
  });

  test('sessionStatusLabel and class names distinguish status colors', () => {
    expect(sessionStatusLabel('paused')).toBe('Paused');
    expect(sessionStatusLabel('running')).toBe('Running');
    expect(sessionStatusLabel('inactive')).toBe('Inactive');

    expect(sessionStatusBadgeClassName('paused')).toContain('yellow');
    expect(sessionStatusBadgeClassName('running')).toContain('green');
    expect(sessionStatusBadgeClassName('inactive')).toContain('gray');
    expect(sessionStatusRowClassName('paused')).toContain('yellow');
    expect(sessionStatusRowClassName('running')).toContain('green');
    expect(sessionStatusRowClassName('inactive')).toContain('gray');
  });
});
