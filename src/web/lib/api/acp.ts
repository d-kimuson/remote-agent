import { parse } from 'valibot';

import {
  agentModelCatalogResponseSchema,
  agentProvidersResponseSchema,
  agentSlashCommandsResponseSchema,
  acpPermissionRequestsResponseSchema,
  appSettingsResponseSchema,
  appSetupStateResponseSchema,
  appInfoSchema,
  cancelSessionResponseSchema,
  checkAgentProviderRequestSchema,
  createCustomAgentProviderRequestSchema,
  createProjectWorktreeRequestSchema,
  directoryListingResponseSchema,
  discoverResumableSessionsRequestSchema,
  fileCompletionResponseSchema,
  filesystemTreeResponseSchema,
  gitDiffRequestSchema,
  gitDiffResponseSchema,
  gitRevisionsResponseSchema,
  loadSessionRequestSchema,
  messageResponseSchema,
  prepareAgentSessionResponseSchema,
  projectResponseSchema,
  projectSettingsResponseSchema,
  projectWorktreeResponseSchema,
  projectsResponseSchema,
  resumableSessionsResponseSchema,
  routinesResponseSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  uploadAttachmentsResponseSchema,
  type AgentModelCatalogResponse,
  type AgentProvidersResponse,
  type AgentSlashCommandsResponse,
  type AcpPermissionRequestsResponse,
  type AppSettingsResponse,
  type AppSetupStateResponse,
  type AppInfo,
  type CancelSessionResponse,
  type CheckAgentProviderRequest,
  type CreateProjectRequest,
  type CreateProjectWorktreeRequest,
  type CreateCustomAgentProviderRequest,
  type CreateRoutineRequest,
  type CreateSessionRequest,
  type DirectoryListingResponse,
  type DiscoverResumableSessionsRequest,
  type FileCompletionResponse,
  type FilesystemTreeResponse,
  type GitDiffRequest,
  type GitDiffResponse,
  type GitRevisionsRequest,
  type GitRevisionsResponse,
  type LoadSessionRequest,
  type MessageResponse,
  type PrepareAgentSessionRequest,
  type PrepareAgentSessionResponse,
  type ProjectResponse,
  type ProjectSettingsResponse,
  type ProjectWorktreeResponse,
  type ProjectsResponse,
  type ResumableSessionsResponse,
  type RoutinesResponse,
  type ResolveAcpPermissionRequest,
  type SessionMessagesResponse,
  type SessionResponse,
  type SessionsResponse,
  type UploadAttachmentsResponse,
  type UpdateSessionConfigOptionRequest,
  type UpdateSessionRequest,
  type UpdateAgentProviderRequest,
  type UpdateAppSettingsRequest,
  type UpdateCustomAgentProviderRequest,
  type UpdateProjectModePreferenceRequest,
  type UpdateProjectModelPreferenceRequest,
  type UpdateProjectSettingsRequest,
  type UpdateRoutineRequest,
  updateCustomAgentProviderRequestSchema,
} from '../../../shared/acp.ts';
import { apiFetch, honoClient } from './client.ts';

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
  const response = await honoClient.filesystem['directory-listing'].$get({
    query: {
      ...(currentPath !== undefined && currentPath.length > 0 ? { currentPath } : {}),
      ...(showHidden !== undefined ? { showHidden: showHidden.toString() } : {}),
    },
  });
  return parse(directoryListingResponseSchema, await response.json());
};

export const fetchFileCompletion = async ({
  basePath,
  projectId,
}: {
  readonly projectId: string;
  readonly basePath: string;
}): Promise<FileCompletionResponse> => {
  const response = await honoClient.filesystem['file-completion'].$get({
    query: { projectId, basePath },
  });
  return parse(fileCompletionResponseSchema, await response.json());
};

export const fetchProjects = async (): Promise<ProjectsResponse> => {
  const response = await honoClient.projects.$get();
  return parse(projectsResponseSchema, await response.json());
};

export const fetchProject = async (projectId: string): Promise<ProjectResponse> => {
  const response = await honoClient.projects[':projectId'].$get({ param: { projectId } });
  return parse(projectResponseSchema, await response.json());
};

export const fetchProjectSettings = async (projectId: string): Promise<ProjectSettingsResponse> => {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
    method: 'GET',
  });
  return parse(projectSettingsResponseSchema, await response.json());
};

export const updateProjectSettingsRequest = async (
  projectId: string,
  request: UpdateProjectSettingsRequest,
): Promise<ProjectSettingsResponse> => {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parse(projectSettingsResponseSchema, await response.json());
};

export const updateProjectModelPreferenceRequest = async (
  projectId: string,
  request: UpdateProjectModelPreferenceRequest,
): Promise<ProjectSettingsResponse> => {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/model-preferences`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  return parse(projectSettingsResponseSchema, await response.json());
};

export const updateProjectModePreferenceRequest = async (
  projectId: string,
  request: UpdateProjectModePreferenceRequest,
): Promise<ProjectSettingsResponse> => {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/mode-preferences`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  return parse(projectSettingsResponseSchema, await response.json());
};

export const createProjectRequest = async (
  request: CreateProjectRequest,
): Promise<ProjectResponse> => {
  const response = await honoClient.projects.$post({ json: request });
  return parse(projectResponseSchema, await response.json());
};

export const createProjectWorktreeRequest = async (
  projectId: string,
  request: CreateProjectWorktreeRequest,
): Promise<ProjectWorktreeResponse> => {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/worktrees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parse(createProjectWorktreeRequestSchema, request)),
  });
  return parse(projectWorktreeResponseSchema, await response.json());
};

export const fetchGitRevisions = async (
  projectId: string,
  request: GitRevisionsRequest,
): Promise<GitRevisionsResponse> => {
  const params = new URLSearchParams();
  if (request.cwd !== null && request.cwd !== undefined && request.cwd.length > 0) {
    params.set('cwd', request.cwd);
  }
  const query = params.size === 0 ? '' : `?${params.toString()}`;
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/git/revisions${query}`,
    {
      method: 'GET',
    },
  );
  return parse(gitRevisionsResponseSchema, await response.json());
};

export const fetchGitDiff = async (
  projectId: string,
  request: GitDiffRequest,
): Promise<GitDiffResponse> => {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git/diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parse(gitDiffRequestSchema, request)),
  });
  return parse(gitDiffResponseSchema, await response.json());
};

export const uploadAttachmentsRequest = async (
  files: readonly File[],
): Promise<UploadAttachmentsResponse> => {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  const response = await apiFetch('/api/attachments/ingest', {
    body: formData,
    method: 'POST',
  });

  return parse(uploadAttachmentsResponseSchema, await response.json());
};

export const fetchSessions = async (): Promise<SessionsResponse> => {
  const response = await honoClient.acp.sessions.$get();
  return parse(sessionsResponseSchema, await response.json());
};

export const fetchAcpPermissionRequests = async (): Promise<AcpPermissionRequestsResponse> => {
  const response = await apiFetch('/api/acp/permissions', { method: 'GET' });
  return parse(acpPermissionRequestsResponseSchema, await response.json());
};

export const resolveAcpPermissionRequest = async (
  requestId: string,
  request: ResolveAcpPermissionRequest,
): Promise<AcpPermissionRequestsResponse> => {
  const response = await apiFetch(`/api/acp/permissions/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parse(acpPermissionRequestsResponseSchema, await response.json());
};

export const fetchAgentProviders = async (): Promise<AgentProvidersResponse> => {
  const response = await honoClient.acp.providers.$get();
  return parse(agentProvidersResponseSchema, await response.json());
};

export const fetchAppSettings = async (): Promise<AppSettingsResponse> => {
  const response = await honoClient.settings.$get();
  return parse(appSettingsResponseSchema, await response.json());
};

export const updateAppSettingsRequest = async (
  request: UpdateAppSettingsRequest,
): Promise<AppSettingsResponse> => {
  const response = await honoClient.settings.$patch({ json: request });
  return parse(appSettingsResponseSchema, await response.json());
};

export const fetchAppSetupState = async (): Promise<AppSetupStateResponse> => {
  const response = await honoClient.setup.$get();
  return parse(appSetupStateResponseSchema, await response.json());
};

export const completeInitialSetupRequest = async (): Promise<AppSetupStateResponse> => {
  const response = await honoClient.setup.complete.$post();
  return parse(appSetupStateResponseSchema, await response.json());
};

export const updateAgentProviderRequest = async (
  presetId: string,
  request: UpdateAgentProviderRequest,
): Promise<AgentProvidersResponse> => {
  const response = await honoClient.acp.providers[':presetId'].$patch({
    param: { presetId },
    json: request,
  });
  return parse(agentProvidersResponseSchema, await response.json());
};

export const createCustomAgentProviderRequest = async (
  request: CreateCustomAgentProviderRequest,
): Promise<AgentProvidersResponse> => {
  const response = await apiFetch('/api/acp/providers/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parse(createCustomAgentProviderRequestSchema, request)),
  });
  return parse(agentProvidersResponseSchema, await response.json());
};

export const deleteCustomAgentProviderRequest = async (
  providerId: string,
): Promise<AgentProvidersResponse> => {
  const response = await apiFetch(`/api/acp/providers/custom/${encodeURIComponent(providerId)}`, {
    method: 'DELETE',
  });
  return parse(agentProvidersResponseSchema, await response.json());
};

export const updateCustomAgentProviderRequest = async (
  providerId: string,
  request: UpdateCustomAgentProviderRequest,
): Promise<AgentProvidersResponse> => {
  const response = await apiFetch(`/api/acp/providers/custom/${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parse(updateCustomAgentProviderRequestSchema, request)),
  });
  return parse(agentProvidersResponseSchema, await response.json());
};

export const checkAgentProviderRequest = async (
  presetId: string,
  request: CheckAgentProviderRequest,
): Promise<AgentModelCatalogResponse> => {
  const response = await honoClient.acp.providers[':presetId'].check.$post({
    param: { presetId },
    json: parse(checkAgentProviderRequestSchema, request),
  });
  return parse(agentModelCatalogResponseSchema, await response.json());
};

export const fetchAgentModelCatalog = async (input: {
  readonly projectId: string;
  readonly presetId: string;
}): Promise<AgentModelCatalogResponse> => {
  const response = await honoClient.acp.agent['model-catalog'].$get({
    query: { projectId: input.projectId, presetId: input.presetId },
  });
  return parse(agentModelCatalogResponseSchema, await response.json());
};

export const fetchAgentSlashCommands = async (input: {
  readonly projectId: string;
  readonly presetId: string;
}): Promise<AgentSlashCommandsResponse> => {
  const response = await honoClient.acp.agent['slash-commands'].$get({
    query: { projectId: input.projectId, presetId: input.presetId },
  });
  return parse(agentSlashCommandsResponseSchema, await response.json());
};

export const fetchResumableSessions = async (
  request: DiscoverResumableSessionsRequest,
): Promise<ResumableSessionsResponse> => {
  const query = parse(discoverResumableSessionsRequestSchema, request);
  const searchParams = new URLSearchParams();

  if (query.projectId !== null && query.projectId !== undefined) {
    searchParams.set('projectId', query.projectId);
  }

  if (query.presetId !== null && query.presetId !== undefined) {
    searchParams.set('presetId', query.presetId);
  }

  if (query.cwd !== null && query.cwd !== undefined) {
    searchParams.set('cwd', query.cwd);
  }

  const url = `/api/acp/sessions/discover${
    searchParams.size === 0 ? '' : `?${searchParams.toString()}`
  }`;
  const response = await apiFetch(url, { method: 'GET' });

  return parse(resumableSessionsResponseSchema, await response.json());
};

export const createSessionRequest = async (
  request: CreateSessionRequest,
): Promise<SessionResponse> => {
  const response = await honoClient.acp.sessions.$post({ json: request });
  return parse(sessionResponseSchema, await response.json());
};

export const prepareAgentSessionRequest = async (
  request: PrepareAgentSessionRequest,
): Promise<PrepareAgentSessionResponse> => {
  const response = await honoClient.acp.agent.prepare.$post({ json: request });
  return parse(prepareAgentSessionResponseSchema, await response.json());
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
  const response = await honoClient.acp.sessions[':sessionId'].$patch({
    param: { sessionId },
    json: request,
  });
  return parse(sessionResponseSchema, await response.json());
};

export const updateSessionConfigOptionRequest = async (
  sessionId: string,
  request: UpdateSessionConfigOptionRequest,
): Promise<SessionResponse> => {
  const response = await apiFetch(
    `/api/acp/sessions/${encodeURIComponent(sessionId)}/config-options`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  return parse(sessionResponseSchema, await response.json());
};

export const fetchSessionMessages = async (sessionId: string): Promise<SessionMessagesResponse> => {
  const response = await honoClient.acp.sessions[':sessionId'].messages.$get({
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
  const response = await honoClient.acp.sessions[':sessionId'].messages.$post({
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

export const sendPreparedPromptRequest = async (
  prepareId: string,
  request: {
    readonly prompt: string;
    readonly attachmentIds: readonly string[];
    readonly modelId?: string | null;
    readonly modeId?: string | null;
  },
): Promise<MessageResponse> => {
  const response = await honoClient.acp.sessions.prepared[':prepareId'].messages.$post({
    param: { prepareId },
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
  await honoClient.acp.sessions[':sessionId'].$delete({ param: { sessionId } });
};

export const cancelSessionRequest = async (sessionId: string): Promise<CancelSessionResponse> => {
  const response = await apiFetch(`/api/acp/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
  });
  return parse(cancelSessionResponseSchema, await response.json());
};

export const stopSessionRequest = async (sessionId: string): Promise<SessionResponse> => {
  const response = await apiFetch(`/api/acp/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
  });
  return parse(sessionResponseSchema, await response.json());
};

export const fetchRoutines = async (): Promise<RoutinesResponse> => {
  const response = await apiFetch('/api/routines', { method: 'GET' });
  return parse(routinesResponseSchema, await response.json());
};

export const createRoutineRequest = async (
  request: CreateRoutineRequest,
): Promise<RoutinesResponse> => {
  const response = await apiFetch('/api/routines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parse(routinesResponseSchema, await response.json());
};

export const updateRoutineRequest = async (
  routineId: string,
  request: UpdateRoutineRequest,
): Promise<RoutinesResponse> => {
  const response = await apiFetch(`/api/routines/${encodeURIComponent(routineId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parse(routinesResponseSchema, await response.json());
};

export const deleteRoutineRequest = async (routineId: string): Promise<RoutinesResponse> => {
  const response = await apiFetch(`/api/routines/${encodeURIComponent(routineId)}`, {
    method: 'DELETE',
  });
  return parse(routinesResponseSchema, await response.json());
};
