import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { type AcpSseEvent, parseAcpSseEventJson } from "../../../shared/acp.ts";
import {
  sessionMessagesQueryKey,
  sessionsQueryKey,
} from "../../app/projects/$projectId/queries.ts";

/** ACP のストリーミングで SSE が連打されるため、invalidate の間隔を空ける */
const ACP_SSE_INVALIDATE_DEBOUNCE_MS = 300;

const mergeEventToPending = (
  pending: {
    needSessionsList: boolean;
    messageSessionIds: Set<string>;
    removedSessionIds: Set<string>;
  },
  event: AcpSseEvent,
) => {
  if (event.type === "session_removed") {
    pending.removedSessionIds.add(event.sessionId);
    pending.needSessionsList = true;
    return;
  }
  if (event.type === "session_messages_updated") {
    pending.needSessionsList = true;
    pending.messageSessionIds.add(event.sessionId);
    return;
  }
  if (event.type === "session_updated") {
    pending.needSessionsList = true;
  }
};

const flushPending = (
  queryClient: QueryClient,
  pending: {
    needSessionsList: boolean;
    messageSessionIds: Set<string>;
    removedSessionIds: Set<string>;
  },
) => {
  for (const sessionId of pending.removedSessionIds) {
    queryClient.removeQueries({ queryKey: sessionMessagesQueryKey(sessionId) });
  }
  if (pending.needSessionsList) {
    void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
  }
  for (const sessionId of pending.messageSessionIds) {
    void queryClient.invalidateQueries({ queryKey: sessionMessagesQueryKey(sessionId) });
  }
  pending.needSessionsList = false;
  pending.messageSessionIds.clear();
  pending.removedSessionIds.clear();
};

export const useAcpSseCacheSync = (): void => {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const pending = {
      needSessionsList: false,
      messageSessionIds: new Set<string>(),
      removedSessionIds: new Set<string>(),
    };

    const scheduleFlush = () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        flushPending(queryClient, pending);
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
      mergeEventToPending(pending, event);
      scheduleFlush();
    };
    source.addEventListener("message", onMessage);
    return () => {
      source.removeEventListener("message", onMessage);
      source.close();
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      const hasWork =
        pending.needSessionsList ||
        pending.messageSessionIds.size > 0 ||
        pending.removedSessionIds.size > 0;
      if (hasWork) {
        flushPending(queryClient, pending);
      }
    };
  }, [queryClient]);
};
