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
import { honoClient } from "./client.ts";

export const fetchAppInfo = async (): Promise<AppInfo> => {
  const response = await honoClient.info.$get();
  return parse(appInfoSchema, await response.json());
};

export const fetchFilesystemTree = async (root?: string): Promise<FilesystemTreeResponse> => {
  const response = await honoClient.filesystem.tree.$get({
    query: root !== undefined && root.length > 0 ? { root } : {},
  });
  return parse(filesystemTreeResponseSchema, await response.json());
};

export const fetchProjects = async (): Promise<ProjectsResponse> => {
  const response = await honoClient.projects.$get();
  return parse(projectsResponseSchema, await response.json());
};

export const fetchProject = async (projectId: string): Promise<ProjectResponse> => {
  const response = await honoClient.projects[":projectId"].$get({ param: { projectId } });
  return parse(projectResponseSchema, await response.json());
};

export const createProjectRequest = async (
  request: CreateProjectRequest,
): Promise<ProjectResponse> => {
  const response = await honoClient.projects.$post({ json: request });
  return parse(projectResponseSchema, await response.json());
};

export const fetchSessions = async (): Promise<SessionsResponse> => {
  const response = await honoClient.acp.sessions.$get();
  return parse(sessionsResponseSchema, await response.json());
};

export const createSessionRequest = async (
  request: CreateSessionRequest,
): Promise<SessionResponse> => {
  const response = await honoClient.acp.sessions.$post({ json: request });
  return parse(sessionResponseSchema, await response.json());
};

export const updateSessionRequest = async (
  sessionId: string,
  request: UpdateSessionRequest,
): Promise<SessionResponse> => {
  const response = await honoClient.acp.sessions[":sessionId"].$patch({
    param: { sessionId },
    json: request,
  });
  return parse(sessionResponseSchema, await response.json());
};

export const sendPromptRequest = async (
  sessionId: string,
  prompt: string,
): Promise<MessageResponse> => {
  const response = await honoClient.acp.sessions[":sessionId"].messages.$post({
    param: { sessionId },
    json: { prompt },
  });
  return parse(messageResponseSchema, await response.json());
};

export const deleteSessionRequest = async (sessionId: string): Promise<void> => {
  await honoClient.acp.sessions[":sessionId"].$delete({ param: { sessionId } });
};
