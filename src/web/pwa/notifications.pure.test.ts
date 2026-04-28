import { describe, expect, test } from 'vitest';

import {
  createAssistantNotificationPayload,
  createSessionPausedNotificationPayload,
} from './notifications.pure.ts';

describe('createAssistantNotificationPayload', () => {
  test('normalizes whitespace and keeps routing metadata', () => {
    const payload = createAssistantNotificationPayload({
      projectId: 'project-1',
      projectName: 'Remote Agent',
      sessionId: 'session-1',
      text: '  first line\n\n second\tline  ',
      timestamp: 1_746_000_000_000,
      url: '/projects/project-1',
    });

    expect(payload).toMatchObject({
      title: 'Remote Agent • Agent response',
      body: 'first line second line',
      tag: 'session:session-1',
      data: {
        projectId: 'project-1',
        sessionId: 'session-1',
        url: '/projects/project-1',
      },
      timestamp: 1_746_000_000_000,
    });
  });

  test('falls back to a generic body when response text is empty', () => {
    const payload = createAssistantNotificationPayload({
      projectId: 'project-1',
      projectName: 'Remote Agent',
      sessionId: 'session-1',
      text: '   ',
      timestamp: 1_746_000_000_000,
      url: '/projects/project-1',
    });

    expect(payload.body).toBe('Agent response received');
  });

  test('truncates long assistant responses', () => {
    const payload = createAssistantNotificationPayload({
      projectId: 'project-1',
      projectName: 'Remote Agent',
      sessionId: 'session-1',
      text: 'x'.repeat(400),
      timestamp: 1_746_000_000_000,
      url: '/projects/project-1',
    });

    expect(payload.body.length).toBe(160);
    expect(payload.body.endsWith('…')).toBe(true);
  });
});

describe('createSessionPausedNotificationPayload', () => {
  test('creates a routeable paused-session notification', () => {
    const payload = createSessionPausedNotificationPayload({
      projectId: 'project-1',
      projectName: 'Remote Agent',
      sessionId: 'session-1',
      sessionTitle: 'Implement notifications',
      timestamp: 1_746_000_000_000,
      url: '/projects/project-1?session-id=session-1',
    });

    expect(payload).toMatchObject({
      title: 'Remote Agent • Agent paused',
      body: 'Implement notifications is ready',
      tag: 'session-paused:session-1',
      data: {
        projectId: 'project-1',
        sessionId: 'session-1',
        url: '/projects/project-1?session-id=session-1',
      },
    });
  });
});
