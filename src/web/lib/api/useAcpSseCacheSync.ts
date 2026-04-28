import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  type AcpSseEvent,
  parseAcpSseEventJson,
  type ProjectsResponse,
  type SessionMessagesResponse,
  type SessionStatus,
  type SessionSummary,
  type SessionsResponse,
} from "../../../shared/acp.ts";
import { addSessionPausedAppNotification } from "../../pwa/notification-center.ts";
import { showSessionPausedNotification } from "../../pwa/notifications.ts";
import { fetchProjects, fetchSessions } from "./acp.ts";
import {
  agentProvidersQueryKey,
  projectsQueryKey,
  sessionMessagesQueryKey,
  sessionsQueryKey,
} from "../../app/projects/$projectId/queries.ts";
import { dispatchAcpSseBrowserEvent } from "./acp-sse-browser-event.ts";
import { applySessionStreamDeltaToMessages } from "./acp-sse-cache.pure.ts";

/** ACP のストリーミングで SSE が連打されるため、invalidate の間隔を空ける */
const ACP_SSE_INVALIDATE_DEBOUNCE_MS = 300;

const applyTextDelta = (queryClient: QueryClient, event: AcpSseEvent): boolean => {
  if (event.type !== "session_text_delta" && event.type !== "session_reasoning_delta") {
    return false;
  }

  queryClient.setQueryData<SessionMessagesResponse>(
    sessionMessagesQueryKey(event.sessionId),
    (current) => applySessionStreamDeltaToMessages(current, event),
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
  },
  event: AcpSseEvent,
  knownStatuses: Map<string, SessionStatus>,
  statusFromCache: (sessionId: string) => SessionStatus | null,
) => {
  if (event.type === "agent_catalog_updated") {
    pending.catalogUpdates.add(`${event.presetId}\0${event.cwd}`);
    return;
  }
  if (event.type === "session_removed") {
    pending.removedSessionIds.add(event.sessionId);
    pending.needSessionsList = true;
    knownStatuses.delete(event.sessionId);
    return;
  }
  if (event.type === "session_messages_updated") {
    pending.needSessionsList = true;
    pending.messageSessionIds.add(event.sessionId);
    return;
  }
  if (event.type === "session_updated") {
    pending.needSessionsList = true;
    if (event.status !== undefined) {
      const previousStatus = knownStatuses.get(event.sessionId) ?? statusFromCache(event.sessionId);
      if (previousStatus === "running" && event.status === "paused") {
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
  const searchParams = new URLSearchParams({ "session-id": session.sessionId });
  return session.projectId === null || session.projectId === undefined
    ? `/projects?${searchParams.toString()}`
    : `/projects/${session.projectId}?${searchParams.toString()}`;
};

const projectNameFrom = async (
  queryClient: QueryClient,
  projectId: string | null | undefined,
): Promise<string> => {
  if (projectId === null || projectId === undefined) {
    return "ACP Playground";
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
      projectId: session.projectId ?? "unknown",
      projectName,
      sessionId: session.sessionId,
      sessionTitle,
      timestamp,
      url,
    });
    toast.success("Agent paused", {
      description: sessionTitle.length > 0 ? sessionTitle : session.sessionId,
    });
    void showSessionPausedNotification({
      projectId: session.projectId ?? "unknown",
      projectName,
      sessionId: session.sessionId,
      sessionTitle,
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
  },
  knownStatuses: Map<string, SessionStatus>,
): Promise<void> => {
  const work = {
    needSessionsList: pending.needSessionsList,
    messageSessionIds: new Set(pending.messageSessionIds),
    pausedSessionIds: new Set(pending.pausedSessionIds),
    removedSessionIds: new Set(pending.removedSessionIds),
    catalogUpdates: new Set(pending.catalogUpdates),
  };
  pending.needSessionsList = false;
  pending.messageSessionIds.clear();
  pending.pausedSessionIds.clear();
  pending.removedSessionIds.clear();
  pending.catalogUpdates.clear();

  const cachedSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
  for (const sessionId of work.removedSessionIds) {
    queryClient.removeQueries({ queryKey: sessionMessagesQueryKey(sessionId) });
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
      if (previousStatus === "running" && session.status === "paused") {
        work.pausedSessionIds.add(session.sessionId);
      }
      knownStatuses.set(session.sessionId, session.status);
    }
  }
  for (const sessionId of work.messageSessionIds) {
    const queryKey = sessionMessagesQueryKey(sessionId);
    void queryClient.invalidateQueries({ queryKey, refetchType: "all" });
  }
  for (const key of work.catalogUpdates) {
    if (key.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["acp", "agent-model-catalog"] });
      void queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
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

  useEffect(() => {
    const knownStatuses = knownStatusesRef.current;
    const pending = {
      needSessionsList: false,
      messageSessionIds: new Set<string>(),
      pausedSessionIds: new Set<string>(),
      removedSessionIds: new Set<string>(),
      catalogUpdates: new Set<string>(),
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
        void flushPending(queryClient, pending, knownStatuses);
      }, ACP_SSE_INVALIDATE_DEBOUNCE_MS);
    };

    const source = new EventSource("/api/acp/sse", { withCredentials: false });
    const onMessage = (ev: MessageEvent<string>) => {
      if (typeof ev.data !== "string") {
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
        pending.catalogUpdates.size > 0;
      if (hasWork) {
        void flushPending(queryClient, pending, knownStatuses);
      }
    };
  }, [queryClient]);
};
