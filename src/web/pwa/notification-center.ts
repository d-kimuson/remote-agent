import { useSyncExternalStore } from 'react';

export type AppNotificationKind = 'session_paused';

export type AppNotification = {
  readonly id: string;
  readonly kind: AppNotificationKind;
  readonly projectId: string;
  readonly projectName: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly createdAt: number;
  readonly readAt: number | null;
};

export type NotificationCenterSnapshot = {
  readonly notifications: readonly AppNotification[];
  readonly unreadCount: number;
};

export type SessionPausedAppNotificationInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly url: string;
  readonly timestamp: number;
};

const notificationLimit = 50;
export const notificationDisplayLimit = 5;

let notifications: readonly AppNotification[] = [];
const listeners = new Set<() => void>();

const snapshotFrom = (items: readonly AppNotification[]): NotificationCenterSnapshot => ({
  notifications: items,
  unreadCount: items.filter((item) => item.readAt === null).length,
});

let snapshot = snapshotFrom(notifications);

const emitChange = (): void => {
  snapshot = snapshotFrom(notifications);
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeNotificationCenter = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getNotificationCenterSnapshot = (): NotificationCenterSnapshot => snapshot;

export const addSessionPausedAppNotification = (
  input: SessionPausedAppNotificationInput,
): AppNotification => {
  const notification = {
    id: `session-paused:${input.sessionId}:${String(input.timestamp)}`,
    kind: 'session_paused',
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: input.sessionId,
    sessionTitle: input.sessionTitle,
    title: 'Agent paused',
    body: input.sessionTitle.length > 0 ? input.sessionTitle : input.sessionId,
    url: input.url,
    createdAt: input.timestamp,
    readAt: null,
  } satisfies AppNotification;

  notifications = [notification, ...notifications].slice(0, notificationLimit);
  emitChange();

  return notification;
};

export const markAllAppNotificationsRead = (): void => {
  const now = Date.now();
  notifications = notifications.map((notification) =>
    notification.readAt === null ? { ...notification, readAt: now } : notification,
  );
  emitChange();
};

export const markAppNotificationRead = (notificationId: string): void => {
  const now = Date.now();
  notifications = notifications.map((notification) =>
    notification.id === notificationId && notification.readAt === null
      ? { ...notification, readAt: now }
      : notification,
  );
  emitChange();
};

export const useNotificationCenter = (): NotificationCenterSnapshot =>
  useSyncExternalStore(
    subscribeNotificationCenter,
    getNotificationCenterSnapshot,
    getNotificationCenterSnapshot,
  );
