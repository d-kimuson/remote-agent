import { HttpError } from './client.ts';

/**
 * True for transient browser/transport failures that are safe to retry
 * (Tailscale blips, brief disconnects, aborted fetches from the network stack).
 * Not true for HTTP application errors or intentional user aborts.
 */
export const isTransientNetworkError = (error: unknown): boolean => {
  if (error instanceof HttpError) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  // User-initiated abort (e.g. navigation cancel) — do not retry.
  if (error.name === 'AbortError' && !/fetch|network|proxy|context canceled/i.test(error.message)) {
    return false;
  }

  if (error.name === 'NetworkError' || error.name === 'TypeError') {
    return true;
  }

  return /failed to fetch|networkerror|network request failed|load failed|context canceled|econnreset|econnrefused|etimedout|socket/i.test(
    error.message,
  );
};

export const promptSendRetryDelay = (attemptIndex: number): number =>
  Math.min(300 * 2 ** attemptIndex, 2_000);

/** Max automatic retries after the first attempt (3 retries ⇒ 4 tries total). */
export const PROMPT_SEND_MAX_RETRIES = 3;
