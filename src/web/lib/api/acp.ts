import { parse } from "valibot";

import {
  appInfoSchema,
  directoryListingResponseSchema,
  discoverResumableSessionsRequestSchema,
  filesystemTreeResponseSchema,
  loadSessionRequestSchema,
  messageResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  resumableSessionsResponseSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  uploadAttachmentsResponseSchema,
  type AppInfo,
  type CreateProjectRequest,
  type CreateSessionRequest,
  type DirectoryListingResponse,
  type DiscoverResumableSessionsRequest,
  type FilesystemTreeResponse,
  type LoadSessionRequest,
  type MessageResponse,
  type ProjectResponse,
  type ProjectsResponse,
  type ResumableSessionsResponse,
  type SessionMessagesResponse,
  type SessionResponse,
  type SessionsResponse,
  type UploadAttachmentsResponse,
  type UpdateSessionRequest,
} from "../../../shared/acp.ts";
import { apiFetch, honoClient } from "./client.ts";

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

export const fetchDirectoryListing = async (
  currentPath?: string,
  showHidden?: boolean,
): Promise<DirectoryListingResponse> => {
  const response = await honoClient.filesystem["directory-listing"].$get({
    query: {
      ...(currentPath !== undefined && currentPath.length > 0 ? { currentPath } : {}),
      ...(showHidden !== undefined ? { showHidden: showHidden.toString() } : {}),
    },
  });
  return parse(directoryListingResponseSchema, await response.json());
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

export const uploadAttachmentsRequest = async (
  files: readonly File[],
): Promise<UploadAttachmentsResponse> => {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file);
  }

  const response = await apiFetch("/api/attachments/ingest", {
    body: formData,
    method: "POST",
  });

  return parse(uploadAttachmentsResponseSchema, await response.json());
};

export const fetchSessions = async (): Promise<SessionsResponse> => {
  const response = await honoClient.acp.sessions.$get();
  return parse(sessionsResponseSchema, await response.json());
};

export const fetchResumableSessions = async (
  request: DiscoverResumableSessionsRequest,
): Promise<ResumableSessionsResponse> => {
  const query = parse(discoverResumableSessionsRequestSchema, request);
  const searchParams = new URLSearchParams();

  if (query.projectId !== null && query.projectId !== undefined) {
    searchParams.set("projectId", query.projectId);
  }

  if (query.presetId !== null && query.presetId !== undefined) {
    searchParams.set("presetId", query.presetId);
  }

  if (query.cwd !== null && query.cwd !== undefined) {
    searchParams.set("cwd", query.cwd);
  }

  const url = `/api/acp/sessions/discover${
    searchParams.size === 0 ? "" : `?${searchParams.toString()}`
  }`;
  const response = await apiFetch(url, { method: "GET" });

  return parse(resumableSessionsResponseSchema, await response.json());
};

export const createSessionRequest = async (
  request: CreateSessionRequest,
): Promise<SessionResponse> => {
  const response = await honoClient.acp.sessions.$post({ json: request });
  return parse(sessionResponseSchema, await response.json());
};

export const loadSessionRequest = async (request: LoadSessionRequest): Promise<SessionResponse> => {
  const response = await honoClient.acp.sessions.load.$post({
    json: parse(loadSessionRequestSchema, request),
  });
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

export const fetchSessionMessages = async (sessionId: string): Promise<SessionMessagesResponse> => {
  const response = await honoClient.acp.sessions[":sessionId"].messages.$get({
    param: { sessionId },
  });
  return parse(sessionMessagesResponseSchema, await response.json());
};

export const sendPromptRequest = async (
  sessionId: string,
  request: {
    readonly prompt: string;
    readonly attachmentIds: readonly string[];
    readonly modelId?: string | null;
    readonly modeId?: string | null;
  },
): Promise<MessageResponse> => {
  const response = await honoClient.acp.sessions[":sessionId"].messages.$post({
    param: { sessionId },
    json: {
      prompt: request.prompt,
      attachmentIds: [...request.attachmentIds],
      ...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
      ...(request.modeId !== undefined ? { modeId: request.modeId } : {}),
    },
  });
  return parse(messageResponseSchema, await response.json());
};

export const deleteSessionRequest = async (sessionId: string): Promise<void> => {
  await honoClient.acp.sessions[":sessionId"].$delete({ param: { sessionId } });
};
