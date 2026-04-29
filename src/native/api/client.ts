import { hc } from 'hono/client';

import type { RouteType } from '../../shared/api.ts';

import {
  apiBaseUrlFromSettings,
  normalizeApiKey,
  type ConnectionSettings,
} from '../../shared/connection-settings.pure.ts';

type Fetch = typeof fetch;

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(`HttpError: ${String(status)} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
  }
}

export type NativeApiClient = {
  readonly apiFetch: Fetch;
  readonly honoClient: ReturnType<typeof hc<RouteType>>;
  readonly apiBaseUrl: string;
};

export const createNativeApiClient = (settings: ConnectionSettings): NativeApiClient => {
  const apiBaseUrl = apiBaseUrlFromSettings(settings);
  const apiKey = normalizeApiKey(settings.apiKey);

  const apiFetch: Fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (apiKey !== null && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${apiKey}`);
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }
    return response;
  };

  return {
    apiBaseUrl,
    apiFetch,
    honoClient: hc<RouteType>(apiBaseUrl, { fetch: apiFetch }),
  };
};
