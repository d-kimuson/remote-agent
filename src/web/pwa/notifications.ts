import {
  createAssistantNotificationPayload,
  createSessionPausedNotificationPayload,
  defaultSystemNotificationPreference,
  isSystemNotificationEnabled,
  parseSystemNotificationPreference,
  systemNotificationPreferenceStorageKey,
  type AssistantNotificationInput,
  type AssistantNotificationPayload,
  type SessionPausedNotificationInput,
  type SystemNotificationPreference,
} from './notifications.pure.ts';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export const getNotificationPermissionState = (): NotificationPermissionState => {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    return 'unsupported';
  }

  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  const permission = getNotificationPermissionState();

  if (permission === 'unsupported') {
    return permission;
  }

  return Notification.requestPermission();
};

export const readSystemNotificationPreference = (): SystemNotificationPreference => {
  if (typeof window === 'undefined') {
    return defaultSystemNotificationPreference;
  }

  try {
    return parseSystemNotificationPreference(
      window.localStorage.getItem(systemNotificationPreferenceStorageKey),
    );
  } catch {
    return defaultSystemNotificationPreference;
  }
};

export const persistSystemNotificationPreference = (
  preference: SystemNotificationPreference,
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(systemNotificationPreferenceStorageKey, preference);
  } catch {
    // Ignore storage failures so the current tab can keep working.
  }
};

export const isSystemNotificationEnabledInApp = (): boolean =>
  isSystemNotificationEnabled(readSystemNotificationPreference());

const showNotification = async (payload: AssistantNotificationPayload): Promise<boolean> => {
  if (getNotificationPermissionState() !== 'granted' || !isSystemNotificationEnabledInApp()) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(payload.title, {
    badge: payload.badge,
    body: payload.body,
    data: payload.data,
    icon: payload.icon,
    tag: payload.tag,
  });

  return true;
};

export const showAssistantResponseNotification = async (
  input: AssistantNotificationInput,
): Promise<boolean> => {
  return showNotification(createAssistantNotificationPayload(input));
};

export const showSessionPausedNotification = async (
  input: SessionPausedNotificationInput,
): Promise<boolean> => {
  return showNotification(createSessionPausedNotificationPayload(input));
};

export const showNotificationPreview = async (
  input: AssistantNotificationInput,
): Promise<boolean> => {
  return showNotification(createAssistantNotificationPayload(input));
};
