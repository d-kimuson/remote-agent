import { describe, expect, test } from 'vitest';

import {
  parseLastChatLocation,
  resolveSessionIdForStaleUrl,
  resolveValidLastChatLocation,
  serializeLastChatLocation,
  shouldEnsureDefaultSession,
} from './last-chat-location.pure.ts';

describe('parseLastChatLocation', () => {
  test('returns null for empty or invalid input', () => {
    expect(parseLastChatLocation(null)).toBeNull();
    expect(parseLastChatLocation('')).toBeNull();
    expect(parseLastChatLocation('{')).toBeNull();
    expect(parseLastChatLocation('{"projectId":"p"}')).toBeNull();
  });

  test('round-trips a valid location', () => {
    const location = { projectId: 'chats', sessionId: 'session-1' };
    expect(parseLastChatLocation(serializeLastChatLocation(location))).toEqual(location);
  });
});

describe('resolveValidLastChatLocation', () => {
  const sessions = [
    { sessionId: 'session-1', projectId: 'chats' },
    { sessionId: 'session-2', projectId: 'other' },
  ];

  test('returns null when nothing was stored', () => {
    expect(
      resolveValidLastChatLocation({
        stored: null,
        sessions,
        sessionsForProject: sessions.filter((session) => session.projectId === 'chats'),
      }),
    ).toBeNull();
  });

  test('keeps an exact session match', () => {
    expect(
      resolveValidLastChatLocation({
        stored: { projectId: 'chats', sessionId: 'session-1' },
        sessions,
        sessionsForProject: [{ sessionId: 'session-1', projectId: 'chats' }],
      }),
    ).toEqual({ projectId: 'chats', sessionId: 'session-1' });
  });

  test('falls back to newest session in the same project', () => {
    expect(
      resolveValidLastChatLocation({
        stored: { projectId: 'chats', sessionId: 'deleted' },
        sessions,
        sessionsForProject: [{ sessionId: 'session-1', projectId: 'chats' }],
      }),
    ).toEqual({ projectId: 'chats', sessionId: 'session-1' });
  });

  test('returns null when the project has no sessions left', () => {
    expect(
      resolveValidLastChatLocation({
        stored: { projectId: 'chats', sessionId: 'deleted' },
        sessions: [{ sessionId: 'session-2', projectId: 'other' }],
        sessionsForProject: [],
      }),
    ).toBeNull();
  });
});

describe('shouldEnsureDefaultSession', () => {
  test('creates when URL has a stale session and the project is empty', () => {
    expect(
      shouldEnsureDefaultSession({
        sessionIdFromUrl: 'gone',
        selectedSessionExists: false,
        projectSessionCount: 0,
      }),
    ).toBe(true);
  });

  test('creates when opening a project with no sessions', () => {
    expect(
      shouldEnsureDefaultSession({
        sessionIdFromUrl: null,
        selectedSessionExists: false,
        projectSessionCount: 0,
      }),
    ).toBe(true);
  });

  test('does not create for intentional draft when sessions exist', () => {
    expect(
      shouldEnsureDefaultSession({
        sessionIdFromUrl: null,
        selectedSessionExists: false,
        projectSessionCount: 2,
      }),
    ).toBe(false);
  });

  test('does not create when a stale URL can fall back to another session', () => {
    expect(
      shouldEnsureDefaultSession({
        sessionIdFromUrl: 'gone',
        selectedSessionExists: false,
        projectSessionCount: 1,
      }),
    ).toBe(false);
  });
});

describe('resolveSessionIdForStaleUrl', () => {
  test('returns newest session when URL points at a missing session', () => {
    expect(
      resolveSessionIdForStaleUrl({
        sessionIdFromUrl: 'gone',
        selectedSessionExists: false,
        newestProjectSessionId: 'session-1',
      }),
    ).toBe('session-1');
  });

  test('returns null when URL is already valid or draft', () => {
    expect(
      resolveSessionIdForStaleUrl({
        sessionIdFromUrl: 'session-1',
        selectedSessionExists: true,
        newestProjectSessionId: 'session-1',
      }),
    ).toBeNull();
    expect(
      resolveSessionIdForStaleUrl({
        sessionIdFromUrl: null,
        selectedSessionExists: false,
        newestProjectSessionId: 'session-1',
      }),
    ).toBeNull();
  });
});
