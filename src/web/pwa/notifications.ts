import {
  createAssistantNotificationPayload,
  createSessionPausedNotificationPayload,
  type AssistantNotificationInput,
  type AssistantNotificationPayload,
  type SessionPausedNotificationInput,
} from "./notifications.pure.ts";

export type NotificationPermissionState = NotificationPermission | "unsupported";

export const getNotificationPermissionState = (): NotificationPermissionState => {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return "unsupported";
  }

  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  const permission = getNotificationPermissionState();

  if (permission === "unsupported") {
    return permission;
  }

  return Notification.requestPermission();
};

const showNotification = async (payload: AssistantNotificationPayload): Promise<boolean> => {
  if (getNotificationPermissionState() !== "granted") {
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
