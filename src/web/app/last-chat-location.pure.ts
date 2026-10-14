export const LAST_CHAT_LOCATION_STORAGE_KEY = 'remote-agent.last-chat-location';

export type LastChatLocation = {
  readonly projectId: string;
  readonly sessionId: string;
};

export type LastChatSessionRef = {
  readonly sessionId: string;
  readonly projectId?: string | null;
};

export const parseLastChatLocation = (raw: string | null): LastChatLocation | null => {
  if (raw === null || raw.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const projectId = Reflect.get(parsed, 'projectId');
    const sessionId = Reflect.get(parsed, 'sessionId');
    if (
      typeof projectId !== 'string' ||
      projectId.trim().length === 0 ||
      typeof sessionId !== 'string' ||
      sessionId.trim().length === 0
    ) {
      return null;
    }
    return { projectId, sessionId };
  } catch {
    return null;
  }
};

export const serializeLastChatLocation = (location: LastChatLocation): string =>
  JSON.stringify({
    projectId: location.projectId,
    sessionId: location.sessionId,
  });

/**
 * Restore last chat only when the stored session still exists.
 * If the exact session is gone but the project still has sessions, fall back to the
 * first entry in `sessionsForProject` (caller should pass newest-first).
 */
export const resolveValidLastChatLocation = ({
  stored,
  sessions,
  sessionsForProject,
}: {
  readonly stored: LastChatLocation | null;
  readonly sessions: readonly LastChatSessionRef[];
  readonly sessionsForProject: readonly LastChatSessionRef[];
}): LastChatLocation | null => {
  if (stored === null) {
    return null;
  }

  const exact = sessions.find((session) => session.sessionId === stored.sessionId);
  if (exact !== undefined) {
    return {
      projectId: exact.projectId ?? stored.projectId,
      sessionId: exact.sessionId,
    };
  }

  const fallback = sessionsForProject[0];
  if (fallback !== undefined) {
    return {
      projectId: fallback.projectId ?? stored.projectId,
      sessionId: fallback.sessionId,
    };
  }

  return null;
};

/** Stale `?session-id=` or empty project → need a real session instead of a blank page. */
export const shouldEnsureDefaultSession = ({
  sessionIdFromUrl,
  selectedSessionExists,
  projectSessionCount,
}: {
  readonly sessionIdFromUrl: string | null;
  readonly selectedSessionExists: boolean;
  readonly projectSessionCount: number;
}): boolean => {
  if (sessionIdFromUrl !== null && !selectedSessionExists) {
    return projectSessionCount === 0;
  }
  return sessionIdFromUrl === null && projectSessionCount === 0;
};

export const resolveSessionIdForStaleUrl = ({
  sessionIdFromUrl,
  selectedSessionExists,
  newestProjectSessionId,
}: {
  readonly sessionIdFromUrl: string | null;
  readonly selectedSessionExists: boolean;
  readonly newestProjectSessionId: string | null;
}): string | null => {
  if (sessionIdFromUrl === null || selectedSessionExists) {
    return null;
  }
  return newestProjectSessionId;
};
