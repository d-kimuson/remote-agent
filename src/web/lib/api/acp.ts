import { parse } from "valibot";

import {
  appInfoSchema,
  filesystemTreeResponseSchema,
  messageResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  type AppInfo,
  type CreateProjectRequest,
  type CreateSessionRequest,
  type FilesystemTreeResponse,
  type MessageResponse,
  type ProjectResponse,
  type ProjectsResponse,
  type SessionResponse,
  type SessionsResponse,
  type UpdateSessionRequest,
} from "../../../shared/acp.ts";

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

export const fetchFilesystemTree = async (root?: string): Promise<FilesystemTreeResponse> => {
  const searchParams = new URLSearchParams();
  if (root !== undefined && root.length > 0) {
    searchParams.set("root", root);
  }

  return parse(
    filesystemTreeResponseSchema,
    await sendJson(`/api/filesystem/tree?${searchParams.toString()}`, {
      method: "GET",
    }),
  );
};

export const fetchProjects = async (): Promise<ProjectsResponse> => {
  return parse(
    projectsResponseSchema,
    await sendJson("/api/projects", {
      method: "GET",
    }),
  );
};

export const fetchProject = async (projectId: string): Promise<ProjectResponse> => {
  return parse(
    projectResponseSchema,
    await sendJson(`/api/projects/${projectId}`, {
      method: "GET",
    }),
  );
};

export const createProjectRequest = async (
  request: CreateProjectRequest,
): Promise<ProjectResponse> => {
  return parse(
    projectResponseSchema,
    await sendJson("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
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
