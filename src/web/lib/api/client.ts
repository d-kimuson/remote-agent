import { hc } from "hono/client";
import type { RouteType } from "../../../shared/api.ts";

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

const customFetch: Fetch = async (input, init) => {
  const response = await fetch(input, { ...init, credentials: "same-origin" });
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText);
  }
  return response;
};

export const apiFetch = customFetch;

export const honoClient = hc<RouteType>("/api", {
  fetch: customFetch,
});
