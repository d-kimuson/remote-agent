import { describe, expect, test } from 'vitest';

import {
  findReusableNotificationClientIndex,
  notificationClickTargetUrl,
} from './notification-click.pure.ts';

const origin = 'https://remote-agent.example';

describe('notificationClickTargetUrl', () => {
  test('normalizes relative same-origin notification URLs', () => {
    expect(notificationClickTargetUrl('/projects/project-1?session-id=session-1', origin)).toBe(
      'https://remote-agent.example/projects/project-1?session-id=session-1',
    );
  });

  test('falls back to the app root for cross-origin notification URLs', () => {
    expect(notificationClickTargetUrl('https://example.test/projects/project-1', origin)).toBe(
      'https://remote-agent.example/',
    );
  });
});

describe('findReusableNotificationClientIndex', () => {
  test('prefers an existing window already displaying the notification route', () => {
    expect(
      findReusableNotificationClientIndex(
        [
          { url: 'https://remote-agent.example/projects/project-2' },
          { url: 'https://remote-agent.example/projects/project-1?session-id=session-1' },
        ],
        '/projects/project-1?session-id=session-1',
        origin,
      ),
    ).toBe(1);
  });

  test('reuses an existing app window instead of requiring a new window', () => {
    expect(
      findReusableNotificationClientIndex(
        [{ url: 'https://remote-agent.example/settings' }],
        '/projects/project-1?session-id=session-1',
        origin,
      ),
    ).toBe(0);
  });

  test('ignores cross-origin windows', () => {
    expect(
      findReusableNotificationClientIndex(
        [{ url: 'https://example.test/projects/project-1' }],
        '/projects/project-1?session-id=session-1',
        origin,
      ),
    ).toBeNull();
  });
});
