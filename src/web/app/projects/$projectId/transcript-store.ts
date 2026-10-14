import { startTransition, useCallback, useSyncExternalStore } from 'react';

import type { AcpSseEvent, ChatMessage } from '../../../../shared/acp.ts';

import { acpSessionUpdateFromMessage, type AcpUsageUpdate } from './acp-session-meta.pure.ts';
import {
  appendMessageToSessionTranscript,
  applyMessageEventToSessionTranscript,
  EMPTY_MESSAGE_IDS,
  EMPTY_MESSAGES,
  EMPTY_TRANSCRIPT_STORE,
  emptySessionTranscript,
  messagesFromSessionTranscript,
  moveSessionTranscript,
  replaceSessionTranscriptMessages,
  sessionTranscriptFromMessages,
  type SessionTranscript,
  type TranscriptStoreState,
} from './transcript-store.pure.ts';

type MessageEvent = Extract<AcpSseEvent, { type: 'message-add' | 'message-delta' }>;

let state: TranscriptStoreState = EMPTY_TRANSCRIPT_STORE;
const listeners = new Set<() => void>();
const EMPTY_SESSION = emptySessionTranscript();

const turnBusyByKey = new Map<string, boolean>();
const usageByKey = new Map<string, AcpUsageUpdate | null>();

/** Stable per-session snapshots so useSyncExternalStore can bail out with Object.is. */
const sessionSnapshotCache = new Map<string, SessionTranscript>();
const messageIdsSnapshotCache = new Map<string, readonly string[]>();
const messageSnapshotCache = new Map<string, ChatMessage | null>();
const messagesArraySnapshotCache = new Map<string, readonly ChatMessage[]>();
const usageSnapshotCache = new Map<string, AcpUsageUpdate | null>();
const turnBusySnapshotCache = new Map<string, boolean>();

const sessionCacheKey = (transcriptKey: string): string => transcriptKey;
const messageCacheKey = (transcriptKey: string, messageId: string): string =>
  `${transcriptKey}\0${messageId}`;

const usageEquals = (left: AcpUsageUpdate | null, right: AcpUsageUpdate | null): boolean => {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return (
    left.used === right.used &&
    left.size === right.size &&
    left.cost?.amount === right.cost?.amount &&
    left.cost?.currency === right.cost?.currency
  );
};

const usageFromMessage = (message: ChatMessage): AcpUsageUpdate | null => {
  const update = acpSessionUpdateFromMessage(message);
  return update?.sessionUpdate === 'usage_update' ? update : null;
};

const syncUsageFromSession = (transcriptKey: string, session: SessionTranscript): boolean => {
  let latest: AcpUsageUpdate | null = usageByKey.get(transcriptKey) ?? null;
  for (const id of session.messageIds.toReversed()) {
    const message = session.messagesById[id];
    if (message === undefined) {
      continue;
    }
    const usage = usageFromMessage(message);
    if (usage !== null) {
      latest = usage;
      break;
    }
  }
  const previous = usageByKey.get(transcriptKey) ?? null;
  if (usageEquals(previous, latest)) {
    return false;
  }
  usageByKey.set(transcriptKey, latest);
  return true;
};

const syncUsageFromMessage = (transcriptKey: string, message: ChatMessage): boolean => {
  const usage = usageFromMessage(message);
  if (usage === null) {
    return false;
  }
  const previous = usageByKey.get(transcriptKey) ?? null;
  if (usageEquals(previous, usage)) {
    return false;
  }
  usageByKey.set(transcriptKey, usage);
  return true;
};

const clearSnapshotCaches = (): void => {
  sessionSnapshotCache.clear();
  messageIdsSnapshotCache.clear();
  messageSnapshotCache.clear();
  messagesArraySnapshotCache.clear();
  usageSnapshotCache.clear();
  turnBusySnapshotCache.clear();
};

const notifyListeners = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

/** Immediate notify — send/hydrate/turnBusy must paint without transition lag. */
const emitChange = (): void => {
  clearSnapshotCaches();
  notifyListeners();
};

/**
 * Deferred notify for high-frequency streaming deltas only, so keystrokes keep
 * priority. Do not use for optimistic send or other user-initiated updates.
 */
const emitChangeDeferred = (): void => {
  clearSnapshotCaches();
  startTransition(() => {
    notifyListeners();
  });
};

const getSession = (transcriptKey: string): SessionTranscript =>
  state.sessions[transcriptKey] ?? EMPTY_SESSION;

const setSession = (transcriptKey: string, session: SessionTranscript): void => {
  const current = state.sessions[transcriptKey];
  if (current === session) {
    return;
  }
  state = {
    sessions: {
      ...state.sessions,
      [transcriptKey]: session,
    },
  };
  syncUsageFromSession(transcriptKey, session);
  emitChange();
};

export const subscribeTranscriptStore = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTranscriptStoreState = (): TranscriptStoreState => state;

export const resetTranscriptStoreForTest = (): void => {
  state = EMPTY_TRANSCRIPT_STORE;
  turnBusyByKey.clear();
  usageByKey.clear();
  clearSnapshotCaches();
  notifyListeners();
};

export const getSessionTranscriptSnapshot = (transcriptKey: string): SessionTranscript => {
  const cached = sessionSnapshotCache.get(sessionCacheKey(transcriptKey));
  if (cached !== undefined) {
    return cached;
  }
  const session = getSession(transcriptKey);
  sessionSnapshotCache.set(sessionCacheKey(transcriptKey), session);
  return session;
};

export const getTranscriptMessageIdsSnapshot = (transcriptKey: string): readonly string[] => {
  const cached = messageIdsSnapshotCache.get(sessionCacheKey(transcriptKey));
  if (cached !== undefined) {
    return cached;
  }
  const ids = getSession(transcriptKey).messageIds;
  messageIdsSnapshotCache.set(sessionCacheKey(transcriptKey), ids);
  return ids;
};

export const getTranscriptMessageSnapshot = (
  transcriptKey: string,
  messageId: string,
): ChatMessage | null => {
  const key = messageCacheKey(transcriptKey, messageId);
  if (messageSnapshotCache.has(key)) {
    return messageSnapshotCache.get(key) ?? null;
  }
  const message = getSession(transcriptKey).messagesById[messageId] ?? null;
  messageSnapshotCache.set(key, message);
  return message;
};

export const getTranscriptMessagesSnapshot = (transcriptKey: string): readonly ChatMessage[] => {
  const cached = messagesArraySnapshotCache.get(sessionCacheKey(transcriptKey));
  if (cached !== undefined) {
    return cached;
  }
  const session = getSession(transcriptKey);
  const messages =
    session.messageIds.length === 0 ? EMPTY_MESSAGES : messagesFromSessionTranscript(session);
  messagesArraySnapshotCache.set(sessionCacheKey(transcriptKey), messages);
  return messages;
};

export const getTranscriptUsageSnapshot = (transcriptKey: string): AcpUsageUpdate | null => {
  if (usageSnapshotCache.has(transcriptKey)) {
    return usageSnapshotCache.get(transcriptKey) ?? null;
  }
  const usage = usageByKey.get(transcriptKey) ?? null;
  usageSnapshotCache.set(transcriptKey, usage);
  return usage;
};

export const getTranscriptTurnBusySnapshot = (transcriptKey: string): boolean => {
  if (turnBusySnapshotCache.has(transcriptKey)) {
    return turnBusySnapshotCache.get(transcriptKey) === true;
  }
  const busy = turnBusyByKey.get(transcriptKey) === true;
  turnBusySnapshotCache.set(transcriptKey, busy);
  return busy;
};

export const replaceTranscriptMessages = (
  transcriptKey: string,
  messages: readonly ChatMessage[],
): void => {
  setSession(transcriptKey, replaceSessionTranscriptMessages(getSession(transcriptKey), messages));
};

export const appendTranscriptStoreMessage = (transcriptKey: string, message: ChatMessage): void => {
  const usageChanged = syncUsageFromMessage(transcriptKey, message);
  const current = getSession(transcriptKey);
  const next = appendMessageToSessionTranscript(current, message);
  if (next === current) {
    if (usageChanged) {
      emitChange();
    }
    return;
  }
  state = {
    sessions: {
      ...state.sessions,
      [transcriptKey]: next,
    },
  };
  syncUsageFromSession(transcriptKey, next);
  emitChange();
};

export const applyTranscriptStoreMessageEvent = (
  transcriptKey: string,
  event: MessageEvent,
): void => {
  setSession(transcriptKey, applyMessageEventToSessionTranscript(getSession(transcriptKey), event));
};

export const moveTranscriptStoreSession = (from: string, to: string): void => {
  const next = moveSessionTranscript({ from, to, state });
  if (next === state) {
    return;
  }
  state = next;
  if (turnBusyByKey.has(from)) {
    turnBusyByKey.set(to, turnBusyByKey.get(from) === true);
    turnBusyByKey.delete(from);
  }
  if (usageByKey.has(from)) {
    usageByKey.set(to, usageByKey.get(from) ?? null);
    usageByKey.delete(from);
  }
  emitChange();
};

export const hasTranscriptStoreSession = (transcriptKey: string): boolean =>
  Object.hasOwn(state.sessions, transcriptKey);

export const setTranscriptTurnBusy = (transcriptKey: string, isBusy: boolean): void => {
  const previous = turnBusyByKey.get(transcriptKey) === true;
  if (previous === isBusy) {
    return;
  }
  turnBusyByKey.set(transcriptKey, isBusy);
  emitChange();
};

/** Batch high-frequency SSE deltas into one store emit per animation frame. */
let rafHandle = 0;
let pendingEvents: { readonly transcriptKey: string; readonly event: MessageEvent }[] = [];

export const enqueueTranscriptStoreMessageEvent = (
  transcriptKey: string,
  event: MessageEvent,
): void => {
  pendingEvents.push({ transcriptKey, event });
  if (rafHandle !== 0) {
    return;
  }
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0;
    const batch = pendingEvents;
    pendingEvents = [];
    if (batch.length === 0) {
      return;
    }
    let nextState = state;
    let changed = false;
    const touchedKeys = new Set<string>();
    for (const item of batch) {
      const currentSession = nextState.sessions[item.transcriptKey] ?? emptySessionTranscript();
      const nextSession = applyMessageEventToSessionTranscript(currentSession, item.event);
      if (nextSession === currentSession) {
        continue;
      }
      changed = true;
      touchedKeys.add(item.transcriptKey);
      if (item.event.type === 'message-add') {
        syncUsageFromMessage(item.transcriptKey, item.event.message);
      }
      nextState = {
        sessions: {
          ...nextState.sessions,
          [item.transcriptKey]: nextSession,
        },
      };
    }
    if (!changed) {
      return;
    }
    state = nextState;
    for (const key of touchedKeys) {
      const session = state.sessions[key];
      if (session !== undefined) {
        syncUsageFromSession(key, session);
      }
    }
    emitChangeDeferred();
  });
};

export const useTranscriptMessageIds = (transcriptKey: string): readonly string[] =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => getTranscriptMessageIdsSnapshot(transcriptKey),
    () => EMPTY_MESSAGE_IDS,
  );

export const useTranscriptMessage = (
  transcriptKey: string,
  messageId: string,
): ChatMessage | null =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => getTranscriptMessageSnapshot(transcriptKey, messageId),
    () => null,
  );

/**
 * Full message array for rare derived views (slash commands).
 * Prefer `useTranscriptMessageIds` + `useTranscriptMessage` for list rendering.
 */
export const useTranscriptMessages = (transcriptKey: string): readonly ChatMessage[] =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => getTranscriptMessagesSnapshot(transcriptKey),
    () => EMPTY_MESSAGES,
  );

export const useTranscriptUsage = (transcriptKey: string): AcpUsageUpdate | null =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => getTranscriptUsageSnapshot(transcriptKey),
    () => null,
  );

export const useTranscriptTurnBusy = (transcriptKey: string): boolean =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => getTranscriptTurnBusySnapshot(transcriptKey),
    () => false,
  );

export const useTranscriptHasSession = (transcriptKey: string): boolean =>
  useSyncExternalStore(
    subscribeTranscriptStore,
    () => hasTranscriptStoreSession(transcriptKey),
    () => false,
  );

export const useTranscriptStoreApi = () => {
  const replace = useCallback((transcriptKey: string, messages: readonly ChatMessage[]) => {
    replaceTranscriptMessages(transcriptKey, messages);
  }, []);
  const append = useCallback((transcriptKey: string, message: ChatMessage) => {
    appendTranscriptStoreMessage(transcriptKey, message);
  }, []);
  const move = useCallback((from: string, to: string) => {
    moveTranscriptStoreSession(from, to);
  }, []);
  return { append, move, replace };
};

export { emptySessionTranscript, sessionTranscriptFromMessages };
