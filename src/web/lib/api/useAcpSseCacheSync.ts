import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  type AcpSseEvent,
  type AcpPermissionRequest,
  type AcpPermissionRequestsResponse,
  parseAcpSseEventJson,
  type ProjectsResponse,
  type SessionMessagesResponse,
  type SessionStatus,
  type SessionSummary,
  type SessionsResponse,
} from '../../../shared/acp.ts';
import {
  agentProvidersQueryKey,
  acpPermissionRequestsQueryKey,
  projectsQueryKey,
  sessionMessagesQueryKey,
  sessionMessagesInfiniteQueryKey,
  sessionsQueryKey,
} from '../../app/projects/$projectId/queries.ts';
import {
  addPermissionRequestAppNotification,
  addSessionPausedAppNotification,
} from '../../pwa/notification-center.ts';
import {
  showPermissionRequestNotification,
  showSessionPausedNotification,
} from '../../pwa/notifications.ts';
import { playTaskCompletionSound } from '../../pwa/task-completion-sound.ts';
import { dispatchAcpSseBrowserEvent } from './acp-sse-browser-event.ts';
import { applySessionStreamDeltaToMessages, newPermissionRequests } from './acp-sse-cache.pure.ts';
import { fetchAcpPermissionRequests, fetchProjects, fetchSessions } from './acp.ts';
import { acpSseUrl } from './client.ts';

/** ACP のストリーミングで SSE が連打されるため、invalidate の間隔を空ける */
const ACP_SSE_INVALIDATE_DEBOUNCE_MS = 300;

const applyTextDelta = (queryClient: QueryClient, event: AcpSseEvent): boolean => {
  if (event.type !== 'session_text_delta' && event.type !== 'session_reasoning_delta') {
    return false;
  }

  // 従来の flat query に適用
  queryClient.setQueryData<SessionMessagesResponse>(
    sessionMessagesQueryKey(event.sessionId),
    (current) => applySessionStreamDeltaToMessages(current, event),
  );

  // infinite query の先頭ページ（最新メッセージ）にも適用
  queryClient.setQueriesData<InfiniteData<SessionMessagesResponse>>(
    { queryKey: sessionMessagesInfiniteQueryKey(event.sessionId) },
    (current) => {
      if (current === undefined) {
        return current;
      }
      const firstPage = current.pages[0];
      if (firstPage === undefined) {
        return current;
      }
      const updatedFirst = applySessionStreamDeltaToMessages(firstPage, event);
      if (updatedFirst === firstPage) {
        return current;
      }
      return {
        ...current,
        pages: [updatedFirst, ...current.pages.slice(1)],
      };
    },
  );

  return true;
};

const mergeEventToPending = (
  pending: {
    needSessionsList: boolean;
    messageSessionIds: Set<string>;
    pausedSessionIds: Set<string>;
    removedSessionIds: Set<string>;
    catalogUpdates: Set<string>;
    permissionRequestsUpdated: boolean;
  },
  event: AcpSseEvent,
  knownStatuses: Map<string, SessionStatus>,
  statusFromCache: (sessionId: string) => SessionStatus | null,
) => {
  if (event.type === 'agent_catalog_updated') {
    pending.catalogUpdates.add(`${event.presetId}\0${event.cwd}`);
    return;
  }
  if (event.type === 'permission_requests_updated') {
    pending.permissionRequestsUpdated = true;
    return;
  }
  if (event.type === 'session_removed') {
    pending.removedSessionIds.add(event.sessionId);
    pending.needSessionsList = true;
    knownStatuses.delete(event.sessionId);
    return;
  }
  if (event.type === 'session_messages_updated') {
    pending.needSessionsList = true;
    pending.messageSessionIds.add(event.sessionId);
    return;
  }
  if (event.type === 'session_updated') {
    pending.needSessionsList = true;
    if (event.status !== undefined) {
      const previousStatus = knownStatuses.get(event.sessionId) ?? statusFromCache(event.sessionId);
      if (previousStatus === 'running' && event.status === 'paused') {
        pending.pausedSessionIds.add(event.sessionId);
      }
      knownStatuses.set(event.sessionId, event.status);
    }
  }
};

const sessionTitleFrom = (session: SessionSummary): string => {
  const title = session.title ?? session.firstUserMessagePreview ?? session.sessionId;
  return title.trim();
};

const sessionUrlFrom = (session: SessionSummary): string => {
  const searchParams = new URLSearchParams({ 'session-id': session.sessionId });
  return session.projectId === null || session.projectId === undefined
    ? `/projects?${searchParams.toString()}`
    : `/projects/${session.projectId}?${searchParams.toString()}`;
};

const sessionTitleFromId = (sessions: readonly SessionSummary[], sessionId: string): string => {
  const session = sessions.find((entry) => entry.sessionId === sessionId);
  if (session !== undefined) {
    return sessionTitleFrom(session);
  }

  return sessionId;
};

const sessionUrlFromId = (sessions: readonly SessionSummary[], sessionId: string): string => {
  const session = sessions.find((entry) => entry.sessionId === sessionId);
  if (session !== undefined) {
    return sessionUrlFrom(session);
  }

  return `/projects?${new URLSearchParams({ 'session-id': sessionId }).toString()}`;
};

const projectIdFromSessionId = (
  sessions: readonly SessionSummary[],
  sessionId: string,
): string | null => sessions.find((session) => session.sessionId === sessionId)?.projectId ?? null;

const projectNameFrom = async (
  queryClient: QueryClient,
  projectId: string | null | undefined,
): Promise<string> => {
  if (projectId === null || projectId === undefined) {
    return 'Remote Agent';
  }

  const cachedProjects = queryClient.getQueryData<ProjectsResponse>(projectsQueryKey);
  const cachedProject = cachedProjects?.projects.find((project) => project.id === projectId);
  if (cachedProject !== undefined) {
    return cachedProject.name;
  }

  const projects = await queryClient.fetchQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
  });
  return projects.projects.find((project) => project.id === projectId)?.name ?? projectId;
};

const notifyPausedSessions = async (
  queryClient: QueryClient,
  sessions: readonly SessionSummary[],
  pausedSessionIds: ReadonlySet<string>,
): Promise<void> => {
  for (const pausedSessionId of pausedSessionIds) {
    const session = sessions.find((entry) => entry.sessionId === pausedSessionId);
    if (session === undefined) {
      continue;
    }

    const timestamp = Date.now();
    const projectName = await projectNameFrom(queryClient, session.projectId);
    const sessionTitle = sessionTitleFrom(session);
    const url = sessionUrlFrom(session);
    addSessionPausedAppNotification({
      projectId: session.projectId ?? 'unknown',
      projectName,
      sessionId: session.sessionId,
      sessionTitle,
      timestamp,
      url,
    });
    toast.success('Agent paused', {
      description: sessionTitle.length > 0 ? sessionTitle : session.sessionId,
    });
    void playTaskCompletionSound();
    void showSessionPausedNotification({
      projectId: session.projectId ?? 'unknown',
      projectName,
      sessionId: session.sessionId,
      sessionTitle,
      timestamp,
      url,
    });
  }
};

const notifyPermissionRequests = async (
  queryClient: QueryClient,
  sessions: readonly SessionSummary[],
  requests: readonly AcpPermissionRequest[],
): Promise<void> => {
  for (const request of requests) {
    const timestamp = Date.now();
    const projectId = projectIdFromSessionId(sessions, request.sessionId);
    const projectName = await projectNameFrom(queryClient, projectId);
    const sessionTitle = sessionTitleFromId(sessions, request.sessionId);
    const requestTitle = request.title ?? request.kind ?? 'Permission request';
    const url = sessionUrlFromId(sessions, request.sessionId);
    addPermissionRequestAppNotification({
      projectId: projectId ?? 'unknown',
      projectName,
      sessionId: request.sessionId,
      sessionTitle,
      requestTitle,
      timestamp,
      url,
    });
    toast.warning('Permission request', {
      description: requestTitle,
    });
    void showPermissionRequestNotification({
      projectId: projectId ?? 'unknown',
      projectName,
      sessionId: request.sessionId,
      requestTitle,
      timestamp,
      url,
    });
  }
};

const flushPending = async (
  queryClient: QueryClient,
  pending: {
    needSessionsList: boolean;
    messageSessionIds: Set<string>;
    pausedSessionIds: Set<string>;
    removedSessionIds: Set<string>;
    catalogUpdates: Set<string>;
    permissionRequestsUpdated: boolean;
  },
  knownStatuses: Map<string, SessionStatus>,
  knownPermissionRequestIds: Set<string>,
): Promise<void> => {
  const work = {
    needSessionsList: pending.needSessionsList,
    messageSessionIds: new Set(pending.messageSessionIds),
    pausedSessionIds: new Set(pending.pausedSessionIds),
    removedSessionIds: new Set(pending.removedSessionIds),
    catalogUpdates: new Set(pending.catalogUpdates),
    permissionRequestsUpdated: pending.permissionRequestsUpdated,
  };
  pending.needSessionsList = false;
  pending.messageSessionIds.clear();
  pending.pausedSessionIds.clear();
  pending.removedSessionIds.clear();
  pending.catalogUpdates.clear();
  pending.permissionRequestsUpdated = false;

  const cachedSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
  for (const sessionId of work.removedSessionIds) {
    queryClient.removeQueries({ queryKey: sessionMessagesQueryKey(sessionId) });
    queryClient.removeQueries({ queryKey: sessionMessagesInfiniteQueryKey(sessionId) });
  }
  let freshSessions: readonly SessionSummary[] | null = null;
  if (work.needSessionsList) {
    const sessionsResponse = await queryClient.fetchQuery({
      queryKey: sessionsQueryKey,
      queryFn: fetchSessions,
    });
    freshSessions = sessionsResponse.sessions;

    for (const session of sessionsResponse.sessions) {
      const previousStatus =
        knownStatuses.get(session.sessionId) ??
        cachedSessions?.sessions.find((entry) => entry.sessionId === session.sessionId)?.status ??
        null;
      if (previousStatus === 'running' && session.status === 'paused') {
        work.pausedSessionIds.add(session.sessionId);
      }
      knownStatuses.set(session.sessionId, session.status);
    }
  }
  for (const sessionId of work.messageSessionIds) {
    const queryKey = sessionMessagesQueryKey(sessionId);
    void queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
    void queryClient.invalidateQueries({
      queryKey: sessionMessagesInfiniteQueryKey(sessionId),
      refetchType: 'all',
    });
  }
  for (const key of work.catalogUpdates) {
    if (key.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['acp', 'agent-model-catalog'] });
      void queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
    }
  }
  if (work.permissionRequestsUpdated) {
    const previousRequests = queryClient.getQueryData<AcpPermissionRequestsResponse>(
      acpPermissionRequestsQueryKey,
    );
    for (const request of previousRequests?.requests ?? []) {
      knownPermissionRequestIds.add(request.id);
    }
    const response = await queryClient.fetchQuery({
      queryKey: acpPermissionRequestsQueryKey,
      queryFn: fetchAcpPermissionRequests,
    });
    const freshRequests = newPermissionRequests({
      current: response.requests,
      knownRequestIds: knownPermissionRequestIds,
    });
    for (const request of response.requests) {
      knownPermissionRequestIds.add(request.id);
    }
    if (freshRequests.length > 0) {
      const sessions =
        freshSessions ??
        queryClient.getQueryData<SessionsResponse>(sessionsQueryKey)?.sessions ??
        (await queryClient.fetchQuery({ queryKey: sessionsQueryKey, queryFn: fetchSessions }))
          .sessions;
      await notifyPermissionRequests(queryClient, sessions, freshRequests);
    }
  }
  if (freshSessions !== null && work.pausedSessionIds.size > 0) {
    await notifyPausedSessions(queryClient, freshSessions, work.pausedSessionIds);
  }
};

export const useAcpSseCacheSync = (): void => {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const knownStatusesRef = useRef(new Map<string, SessionStatus>());
  const knownPermissionRequestIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const knownStatuses = knownStatusesRef.current;
    const pending = {
      needSessionsList: false,
      messageSessionIds: new Set<string>(),
      pausedSessionIds: new Set<string>(),
      removedSessionIds: new Set<string>(),
      catalogUpdates: new Set<string>(),
      permissionRequestsUpdated: false,
    };

    const statusFromCache = (sessionId: string): SessionStatus | null => {
      const sessionsResponse = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
      return (
        sessionsResponse?.sessions.find((session) => session.sessionId === sessionId)?.status ??
        null
      );
    };

    const scheduleFlush = () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        void flushPending(
          queryClient,
          pending,
          knownStatuses,
          knownPermissionRequestIdsRef.current,
        );
      }, ACP_SSE_INVALIDATE_DEBOUNCE_MS);
    };

    const source = new EventSource(acpSseUrl(), { withCredentials: false });
    const onMessage = (ev: MessageEvent<string>) => {
      if (typeof ev.data !== 'string') {
        return;
      }
      let event: AcpSseEvent;
      try {
        event = parseAcpSseEventJson(ev.data);
      } catch {
        return;
      }
      dispatchAcpSseBrowserEvent(event);
      if (applyTextDelta(queryClient, event)) {
        return;
      }
      mergeEventToPending(pending, event, knownStatuses, statusFromCache);
      scheduleFlush();
    };
    source.onmessage = onMessage;
    const knownPermissionRequestIds = knownPermissionRequestIdsRef.current;
    return () => {
      source.onmessage = null;
      source.close();
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      const hasWork =
        pending.needSessionsList ||
        pending.messageSessionIds.size > 0 ||
        pending.pausedSessionIds.size > 0 ||
        pending.removedSessionIds.size > 0 ||
        pending.catalogUpdates.size > 0 ||
        pending.permissionRequestsUpdated;
      if (hasWork) {
        void flushPending(queryClient, pending, knownStatuses, knownPermissionRequestIds);
      }
    };
  }, [queryClient]);
};
