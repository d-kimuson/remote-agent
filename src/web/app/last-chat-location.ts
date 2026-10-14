import {
  LAST_CHAT_LOCATION_STORAGE_KEY,
  parseLastChatLocation,
  serializeLastChatLocation,
  type LastChatLocation,
} from './last-chat-location.pure.ts';

export type { LastChatLocation };
export {
  resolveSessionIdForStaleUrl,
  resolveValidLastChatLocation,
  shouldEnsureDefaultSession,
} from './last-chat-location.pure.ts';

export const readLastChatLocation = (): LastChatLocation | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return parseLastChatLocation(window.localStorage.getItem(LAST_CHAT_LOCATION_STORAGE_KEY));
};

export const rememberLastChatLocation = (location: LastChatLocation): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(LAST_CHAT_LOCATION_STORAGE_KEY, serializeLastChatLocation(location));
};

export const clearLastChatLocation = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(LAST_CHAT_LOCATION_STORAGE_KEY);
};
