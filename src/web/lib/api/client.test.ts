/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  apiAuthRequiredEvent,
  apiFetch,
  isApiAuthRequired,
  persistApiConfig,
  storedApiKey,
  storedApiUrl,
} from './client.ts';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('API config persistence', () => {
  test('persists key and api URL in localStorage', () => {
    persistApiConfig({
      apiKey: '  secret-key  ',
      apiUrl: 'https://example.com/api/',
    });

    expect(storedApiKey()).toBe('secret-key');
    expect(storedApiUrl()).toBe('https://example.com/api');
  });

  test('defaults api URL to same-domain /api in browser', () => {
    localStorage.clear();
    expect(storedApiUrl()).toBe('http://localhost/api');
  });
});

describe('apiFetch', () => {
  test('rewrites relative /api path and sends bearer header', async () => {
    persistApiConfig({
      apiKey: 'abc123',
      apiUrl: 'http://localhost:3333/custom-api',
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200, statusText: 'OK' }));

    const response = await apiFetch('/api/hello');
    expect(response).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3333/custom-api/hello', expect.anything());

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get('authorization')).toBe('Bearer abc123');
  });

  test('dispatches auth-required event and stores flag on 401', async () => {
    persistApiConfig({ apiKey: 'wrong', apiUrl: 'http://localhost/api' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }));
    const listener = vi.fn();
    window.addEventListener(apiAuthRequiredEvent, listener);

    try {
      await expect(apiFetch('/api/test')).rejects.toThrow('HttpError: 401 Unauthorized');
    } finally {
      window.removeEventListener(apiAuthRequiredEvent, listener);
    }
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isApiAuthRequired()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
