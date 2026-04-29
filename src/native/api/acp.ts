import { parse } from 'valibot';

import type { ConnectionSettings } from '../../shared/connection-settings.pure.ts';

import {
  agentModelCatalogResponseSchema,
  agentProvidersResponseSchema,
  createProjectWorktreeRequestSchema,
  createRoutineRequestSchema,
  createSessionRequestSchema,
  messageResponseSchema,
  projectSettingsResponseSchema,
  projectWorktreeResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  routinesResponseSchema,
  sendMessageRequestSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateAgentProviderRequestSchema,
  updateProjectModePreferenceRequestSchema,
  updateProjectModelPreferenceRequestSchema,
  updateRoutineRequestSchema,
  updateSessionRequestSchema,
  type AgentModelCatalogResponse,
  type AgentProvidersResponse,
  type CreateProjectWorktreeRequest,
  type CreateRoutineRequest,
  type CreateSessionRequest,
  type MessageResponse,
  type ProjectSettingsResponse,
  type ProjectWorktreeResponse,
  type ProjectResponse,
  type ProjectsResponse,
  type RoutinesResponse,
  type SendMessageRequest,
  type SessionMessagesResponse,
  type SessionResponse,
  type SessionsResponse,
  type UpdateAgentProviderRequest,
  type UpdateProjectModePreferenceRequest,
  type UpdateProjectModelPreferenceRequest,
  type UpdateRoutineRequest,
  type UpdateSessionRequest,
} from '../../shared/acp.ts';
import { createNativeApiClient } from './client.ts';

export const createNativeAcpApi = (settings: ConnectionSettings) => {
  const client = createNativeApiClient(settings);

  const fetchProjects = async (): Promise<ProjectsResponse> => {
    const response = await client.honoClient.projects.$get();
    return parse(projectsResponseSchema, await response.json());
  };

  const fetchProject = async (projectId: string): Promise<ProjectResponse> => {
    const response = await client.honoClient.projects[':projectId'].$get({
      param: { projectId },
    });
    return parse(projectResponseSchema, await response.json());
  };

  const fetchProjectSettings = async (projectId: string): Promise<ProjectSettingsResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/settings`,
      { method: 'GET' },
    );
    return parse(projectSettingsResponseSchema, await response.json());
  };

  const updateProjectModelPreference = async (
    projectId: string,
    request: UpdateProjectModelPreferenceRequest,
  ): Promise<ProjectSettingsResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/model-preferences`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parse(updateProjectModelPreferenceRequestSchema, request)),
      },
    );
    return parse(projectSettingsResponseSchema, await response.json());
  };

  const updateProjectModePreference = async (
    projectId: string,
    request: UpdateProjectModePreferenceRequest,
  ): Promise<ProjectSettingsResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/mode-preferences`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parse(updateProjectModePreferenceRequestSchema, request)),
      },
    );
    return parse(projectSettingsResponseSchema, await response.json());
  };

  const createProjectWorktree = async (
    projectId: string,
    request: CreateProjectWorktreeRequest,
  ): Promise<ProjectWorktreeResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/worktrees`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parse(createProjectWorktreeRequestSchema, request)),
      },
    );
    return parse(projectWorktreeResponseSchema, await response.json());
  };

  const fetchAgentProviders = async (): Promise<AgentProvidersResponse> => {
    const response = await client.honoClient.acp.providers.$get();
    return parse(agentProvidersResponseSchema, await response.json());
  };

  const updateAgentProvider = async (
    presetId: string,
    request: UpdateAgentProviderRequest,
  ): Promise<AgentProvidersResponse> => {
    const response = await client.honoClient.acp.providers[':presetId'].$patch({
      param: { presetId },
      json: parse(updateAgentProviderRequestSchema, request),
    });
    return parse(agentProvidersResponseSchema, await response.json());
  };

  const fetchAgentModelCatalog = async (input: {
    readonly projectId: string;
    readonly presetId: string;
  }): Promise<AgentModelCatalogResponse> => {
    const response = await client.honoClient.acp.agent['model-catalog'].$get({
      query: { projectId: input.projectId, presetId: input.presetId },
    });
    return parse(agentModelCatalogResponseSchema, await response.json());
  };

  const fetchSessions = async (): Promise<SessionsResponse> => {
    const response = await client.honoClient.acp.sessions.$get();
    return parse(sessionsResponseSchema, await response.json());
  };

  const fetchSessionMessages = async (sessionId: string): Promise<SessionMessagesResponse> => {
    const response = await client.honoClient.acp.sessions[':sessionId'].messages.$get({
      param: { sessionId },
    });
    return parse(sessionMessagesResponseSchema, await response.json());
  };

  const createSession = async (request: CreateSessionRequest): Promise<SessionResponse> => {
    const response = await client.honoClient.acp.sessions.$post({
      json: parse(createSessionRequestSchema, request),
    });
    return parse(sessionResponseSchema, await response.json());
  };

  const updateSession = async (
    sessionId: string,
    request: UpdateSessionRequest,
  ): Promise<SessionResponse> => {
    const response = await client.honoClient.acp.sessions[':sessionId'].$patch({
      param: { sessionId },
      json: parse(updateSessionRequestSchema, request),
    });
    return parse(sessionResponseSchema, await response.json());
  };

  const sendPrompt = async (
    sessionId: string,
    request: SendMessageRequest,
  ): Promise<MessageResponse> => {
    const response = await client.honoClient.acp.sessions[':sessionId'].messages.$post({
      param: { sessionId },
      json: parse(sendMessageRequestSchema, request),
    });
    return parse(messageResponseSchema, await response.json());
  };

  const fetchRoutines = async (): Promise<RoutinesResponse> => {
    const response = await client.apiFetch(`${client.apiBaseUrl}/routines`, { method: 'GET' });
    return parse(routinesResponseSchema, await response.json());
  };

  const createRoutine = async (request: CreateRoutineRequest): Promise<RoutinesResponse> => {
    const response = await client.apiFetch(`${client.apiBaseUrl}/routines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parse(createRoutineRequestSchema, request)),
    });
    return parse(routinesResponseSchema, await response.json());
  };

  const updateRoutine = async (
    routineId: string,
    request: UpdateRoutineRequest,
  ): Promise<RoutinesResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/routines/${encodeURIComponent(routineId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parse(updateRoutineRequestSchema, request)),
      },
    );
    return parse(routinesResponseSchema, await response.json());
  };

  const deleteRoutine = async (routineId: string): Promise<RoutinesResponse> => {
    const response = await client.apiFetch(
      `${client.apiBaseUrl}/routines/${encodeURIComponent(routineId)}`,
      { method: 'DELETE' },
    );
    return parse(routinesResponseSchema, await response.json());
  };

  return {
    createProjectWorktree,
    createRoutine,
    deleteRoutine,
    fetchAgentProviders,
    fetchAgentModelCatalog,
    fetchProjectSettings,
    fetchProject,
    fetchProjects,
    fetchRoutines,
    fetchSessionMessages,
    fetchSessions,
    updateAgentProvider,
    updateProjectModePreference,
    updateProjectModelPreference,
    updateRoutine,
    updateSession,
    createSession,
    sendPrompt,
  };
};

export type NativeAcpApi = ReturnType<typeof createNativeAcpApi>;
