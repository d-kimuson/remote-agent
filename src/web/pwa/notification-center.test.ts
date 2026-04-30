import { beforeEach, describe, expect, test } from 'vitest';

import {
  addPermissionRequestAppNotification,
  addSessionPausedAppNotification,
  getNotificationCenterSnapshot,
  markAppNotificationsReadForSession,
  resetNotificationCenterForTest,
} from './notification-center.ts';

const baseInput = {
  projectId: 'project-1',
  projectName: 'Remote Agent',
  sessionTitle: 'Implement notifications',
  url: '/projects/project-1?session-id=session-1',
};

beforeEach(() => {
  resetNotificationCenterForTest();
});

describe('markAppNotificationsReadForSession', () => {
  test('marks every unread notification for the session as read', () => {
    addSessionPausedAppNotification({
      ...baseInput,
      sessionId: 'session-1',
      timestamp: 1,
    });
    addPermissionRequestAppNotification({
      ...baseInput,
      sessionId: 'session-1',
      requestTitle: 'Allow shell command',
      timestamp: 2,
    });
    addSessionPausedAppNotification({
      ...baseInput,
      sessionId: 'session-2',
      timestamp: 3,
      url: '/projects/project-1?session-id=session-2',
    });

    markAppNotificationsReadForSession('session-1');

    const snapshot = getNotificationCenterSnapshot();
    expect(snapshot.unreadCount).toBe(1);
    expect(
      snapshot.notifications
        .filter((notification) => notification.sessionId === 'session-1')
        .every((notification) => notification.readAt !== null),
    ).toBe(true);
    expect(
      snapshot.notifications.find((notification) => notification.sessionId === 'session-2')?.readAt,
    ).toBeNull();
  });
});
