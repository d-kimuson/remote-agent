import { parse } from "valibot";

import {
  appInfoSchema,
  messageResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  type AppInfo,
  type CreateSessionRequest,
  type MessageResponse,
  type SessionResponse,
  type SessionsResponse,
  type UpdateSessionRequest,
} from "@/shared/acp";

const readResponseBody = async (
  response: Response,
): Promise<{
  readonly bodyText: string;
  readonly data: unknown;
}> => {
  const bodyText = await response.text();
  if (bodyText.length === 0) {
    return { bodyText, data: null };
  }

  try {
    const data: unknown = JSON.parse(bodyText);
    return { bodyText, data };
  } catch {
    return { bodyText, data: null };
  }
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const { bodyText, data } = await readResponseBody(response);
  if (typeof data !== "object" || data === null) {
    return bodyText.length > 0
      ? `${response.status} ${response.statusText}: ${bodyText}`
      : `${response.status} ${response.statusText}`;
  }

  if (!("error" in data)) {
    return `${response.status} ${response.statusText}`;
  }

  const errorValue = data.error;
  return typeof errorValue === "string" ? errorValue : `${response.status} ${response.statusText}`;
};

const sendJson = async (input: RequestInfo | URL, init: RequestInit): Promise<unknown> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const { data } = await readResponseBody(response);
  return data;
};

export const fetchAppInfo = async (): Promise<AppInfo> => {
  return parse(
    appInfoSchema,
    await sendJson("/api/info", {
      method: "GET",
    }),
  );
};

export const fetchSessions = async (): Promise<SessionsResponse> => {
  return parse(
    sessionsResponseSchema,
    await sendJson("/api/acp/sessions", {
      method: "GET",
    }),
  );
};

export const createSessionRequest = async (
  request: CreateSessionRequest,
): Promise<SessionResponse> => {
  return parse(
    sessionResponseSchema,
    await sendJson("/api/acp/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }),
  );
};

export const updateSessionRequest = async (
  sessionId: string,
  request: UpdateSessionRequest,
): Promise<SessionResponse> => {
  return parse(
    sessionResponseSchema,
    await sendJson(`/api/acp/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }),
  );
};

export const sendPromptRequest = async (
  sessionId: string,
  prompt: string,
): Promise<MessageResponse> => {
  return parse(
    messageResponseSchema,
    await sendJson(`/api/acp/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    }),
  );
};

export const deleteSessionRequest = async (sessionId: string): Promise<void> => {
  await sendJson(`/api/acp/sessions/${sessionId}`, {
    method: "DELETE",
  });
};
