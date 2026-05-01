import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  apiAuthRequiredEvent,
  apiFetch,
  isApiAuthRequired,
  persistApiConfig,
  storedApiKey,
  storedApiUrl,
} from './client.ts';

const createTestStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const stubBrowserGlobals = (): void => {
  const eventTarget = new EventTarget();
  const testStorage = createTestStorage();
  const testWindow = {
    location: new URL('http://localhost/'),
    localStorage: testStorage,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
  };
  vi.stubGlobal('localStorage', testStorage);
  vi.stubGlobal('window', testWindow);
};

beforeEach(() => {
  stubBrowserGlobals();
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
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3333/custom-api/hello',
      expect.anything(),
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    if (!(headers instanceof Headers)) {
      throw new Error('headers should be a Headers instance');
    }
    expect(headers.get('authorization')).toBe('Bearer abc123');
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

  test('clears auth-required flag when API config is saved', async () => {
    persistApiConfig({ apiKey: 'wrong', apiUrl: 'http://localhost/api' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    await expect(apiFetch('/api/test')).rejects.toThrow('HttpError: 401 Unauthorized');
    expect(isApiAuthRequired()).toBe(true);

    persistApiConfig({ apiKey: 'correct', apiUrl: 'http://localhost/api' });

    expect(isApiAuthRequired()).toBe(false);
  });
});
