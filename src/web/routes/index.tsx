import { useSuspenseQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { Suspense, useEffect, useMemo } from 'react';

import {
  clearLastChatLocation,
  readLastChatLocation,
  resolveValidLastChatLocation,
} from '../app/last-chat-location.ts';
import { sortSessionsNewestFirst } from '../app/projects/$projectId/project-session-list.pure.ts';
import { sessionsQueryKey } from '../app/projects/$projectId/queries.ts';
import { BootLoading } from '../components/boot-loading.tsx';
import { fetchSessions } from '../lib/api/acp.ts';

const IndexRedirect = () => {
  const stored = readLastChatLocation();
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });

  const resolved = useMemo(() => {
    if (stored === null) {
      return null;
    }
    const sessionsForProject = sortSessionsNewestFirst(
      sessionsData.sessions.filter((session) => session.projectId === stored.projectId),
    );
    return resolveValidLastChatLocation({
      stored,
      sessions: sessionsData.sessions,
      sessionsForProject,
    });
  }, [sessionsData.sessions, stored]);

  useEffect(() => {
    if (stored !== null && resolved === null) {
      clearLastChatLocation();
    }
  }, [resolved, stored]);

  if (resolved !== null) {
    return (
      <Navigate
        params={{ projectId: resolved.projectId }}
        replace
        search={{ 'session-id': resolved.sessionId }}
        to="/projects/$projectId"
      />
    );
  }

  // Stored project with zero sessions → open it so the chat page can create a default session.
  if (stored !== null) {
    return <Navigate params={{ projectId: stored.projectId }} replace to="/projects/$projectId" />;
  }

  return <Navigate to="/projects" />;
};

export const Route = createFileRoute('/')({
  component: () => (
    <Suspense fallback={<BootLoading />}>
      <IndexRedirect />
    </Suspense>
  ),
});
