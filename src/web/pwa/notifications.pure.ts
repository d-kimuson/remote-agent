export const notificationIconPath = "/pwa-192.png";
export const notificationBadgePath = "/badge-96.png";

const notificationBodyLimit = 160;

export type AssistantNotificationInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly sessionId: string;
  readonly text: string;
  readonly url: string;
  readonly timestamp: number;
};

export type AssistantNotificationPayload = {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly icon: string;
  readonly badge: string;
  readonly data: {
    readonly projectId: string;
    readonly sessionId: string;
    readonly url: string;
  };
  readonly timestamp: number;
};

const normalizeNotificationBody = (text: string): string => text.trim().replaceAll(/\s+/g, " ");

const truncateNotificationBody = (text: string): string => {
  if (text.length <= notificationBodyLimit) {
    return text;
  }

  return `${text.slice(0, notificationBodyLimit - 1).trimEnd()}…`;
};

export const createAssistantNotificationPayload = (
  input: AssistantNotificationInput,
): AssistantNotificationPayload => {
  const normalizedBody = truncateNotificationBody(normalizeNotificationBody(input.text));

  return {
    title: `${input.projectName} • Agent response`,
    body: normalizedBody.length > 0 ? normalizedBody : "Agent response received",
    tag: `session:${input.sessionId}`,
    icon: notificationIconPath,
    badge: notificationBadgePath,
    data: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      url: input.url,
    },
    timestamp: input.timestamp,
  };
};
