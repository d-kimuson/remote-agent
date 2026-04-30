import { useSyncExternalStore } from 'react';

export type AppNotificationKind = 'session_paused' | 'permission_request';

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

export type PermissionRequestAppNotificationInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly requestTitle: string;
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

export const resetNotificationCenterForTest = (): void => {
  notifications = [];
  emitChange();
};

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

export const addPermissionRequestAppNotification = (
  input: PermissionRequestAppNotificationInput,
): AppNotification => {
  const notification = {
    id: `permission-request:${input.sessionId}:${String(input.timestamp)}`,
    kind: 'permission_request',
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: input.sessionId,
    sessionTitle: input.sessionTitle,
    title: 'Permission request',
    body: input.requestTitle.length > 0 ? input.requestTitle : 'Agent needs permission',
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

export const markAppNotificationsReadForSession = (sessionId: string): void => {
  const now = Date.now();
  notifications = notifications.map((notification) =>
    notification.sessionId === sessionId && notification.readAt === null
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
