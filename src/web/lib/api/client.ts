import { hc } from 'hono/client';
import { object, safeParse, string } from 'valibot';

import type { RouteType } from '../../../shared/api.ts';

type Fetch = typeof fetch;

const apiKeyStorageKey = 'remote-agent.api-key';
const responseErrorSchema = object({
  error: string(),
});

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

export const acpSseUrl = (): string => {
  const apiKey = storedApiKey();
  if (apiKey === null || apiKey.length === 0) {
    return '/api/acp/sse';
  }
  const params = new URLSearchParams({ ra_api_key: apiKey });
  return `/api/acp/sse?${params.toString()}`;
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

const customFetch: Fetch = async (input, init) => {
  const apiKey = storedApiKey();
  const headers = new Headers(init?.headers);
  if (apiKey !== null && apiKey.length > 0 && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  const response = await fetch(input, { ...init, credentials: 'same-origin', headers });
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, await responseErrorMessage(response));
  }
  return response;
};

export const apiFetch = customFetch;

export const honoClient = hc<RouteType>('/api', {
  fetch: customFetch,
});
