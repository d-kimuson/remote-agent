import { hc } from 'hono/client';
import { object, safeParse, string } from 'valibot';

import type { RouteType } from '../../../shared/api.ts';

type Fetch = typeof fetch;

const apiKeyStorageKey = 'remote-agent.api-key';
const apiUrlStorageKey = 'remote-agent.api-url';
const apiAuthRequiredStorageKey = 'remote-agent.api-auth-required';
const responseErrorSchema = object({
  error: string(),
});
export const apiAuthRequiredEvent = 'remote-agent:api-auth-required';

const trimmedOrNull = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
};

const defaultApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return '/api';
  }
  return `${window.location.origin}/api`;
};

const normalizeApiPath = (path: string): string => {
  if (path === '/api' || path === '/api/') {
    return '/';
  }

  return path.startsWith('/api') ? path.slice(4) : path;
};

const normalizeApiUrl = (value: string | null | undefined): string => {
  const trimmed = trimmedOrNull(value);
  if (trimmed === null) {
    return defaultApiUrl();
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    const path = parsed.pathname.replace(/\/+$/, '');
    const normalizedPath = path.length === 0 || path === '/' ? '/api' : path;
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return defaultApiUrl();
  }
};

const apiUrl = (): string => {
  if (typeof window === 'undefined') {
    return '/api';
  }
  return normalizeApiUrl(window.localStorage.getItem(apiUrlStorageKey));
};

const setApiAuthRequired = (required: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }
  if (required) {
    window.localStorage.setItem(apiAuthRequiredStorageKey, '1');
  } else {
    window.localStorage.removeItem(apiAuthRequiredStorageKey);
  }
};

export const isApiAuthRequired = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(apiAuthRequiredStorageKey) === '1';
};

const resolveApiUrl = (path: string): string => {
  const normalizedPath = normalizeApiPath(path);
  const safePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${apiUrl()}${safePath}`;
};

export const persistApiConfig = ({
  apiKey,
  apiUrl: nextApiUrl,
}: {
  readonly apiKey: string;
  readonly apiUrl: string;
}): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedKey = trimmedOrNull(apiKey);
  if (normalizedKey === null) {
    window.localStorage.removeItem(apiKeyStorageKey);
  } else {
    window.localStorage.setItem(apiKeyStorageKey, normalizedKey);
  }
  window.localStorage.setItem(apiUrlStorageKey, normalizeApiUrl(nextApiUrl));
};

const apiKeyFromUrl = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = new URL(window.location.href).searchParams.get('ra_api_key');
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    return null;
  }
  window.localStorage.setItem(apiKeyStorageKey, normalized);
  return normalized;
};

export const storedApiKey = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return apiKeyFromUrl() ?? window.localStorage.getItem(apiKeyStorageKey);
};

export const storedApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return '/api';
  }
  return apiUrl();
};

export const acpSseUrl = (): string => {
  const apiKey = storedApiKey();
  if (apiKey === null || apiKey.trim().length === 0) {
    return resolveApiUrl('/acp/sse');
  }
  const params = new URLSearchParams({ ra_api_key: apiKey.trim() });
  return `${resolveApiUrl('/acp/sse')}?${params.toString()}`;
};

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly bodyMessage: string | null;

  constructor(status: number, statusText: string, bodyMessage: string | null = null) {
    super(bodyMessage ?? `HttpError: ${String(status)} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.bodyMessage = bodyMessage;
  }
}

const responseErrorMessage = async (response: Response): Promise<string | null> => {
  try {
    const body: unknown = await response.clone().json();
    const parsed = safeParse(responseErrorSchema, body);
    return parsed.success ? parsed.output.error : null;
  } catch {
    return null;
  }
};

const rewriteApiRequestInput = (input: string): string => {
  return input.startsWith('/api/') || input === '/api' ? resolveApiUrl(input) : input;
};

const customFetch: Fetch = async (input, init) => {
  const effectiveInput = typeof input === 'string' ? rewriteApiRequestInput(input) : input;
  const apiKey = storedApiKey();
  const headers = new Headers(init?.headers);
  if (apiKey !== null && apiKey.length > 0 && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  const response = await fetch(effectiveInput, { ...init, credentials: 'same-origin', headers });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      setApiAuthRequired(true);
      window.dispatchEvent(new CustomEvent(apiAuthRequiredEvent));
    }
    throw new HttpError(response.status, response.statusText, await responseErrorMessage(response));
  }
  setApiAuthRequired(false);
  return response;
};

export const apiFetch = customFetch;

export const honoClient = hc<RouteType>('/api', {
  fetch: customFetch,
});
