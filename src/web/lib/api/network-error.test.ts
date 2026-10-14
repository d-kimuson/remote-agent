import { describe, expect, test } from 'vitest';

import { HttpError } from './client.ts';
import {
  isTransientNetworkError,
  promptSendRetryDelay,
  PROMPT_SEND_MAX_RETRIES,
} from './network-error.ts';

describe('isTransientNetworkError', () => {
  test('detects Firefox NetworkError message', () => {
    const error = new TypeError('NetworkError when attempting to fetch resource.');
    expect(isTransientNetworkError(error)).toBe(true);
  });

  test('detects Chrome failed to fetch', () => {
    expect(isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  test('detects named NetworkError', () => {
    const error = new Error('connection lost');
    error.name = 'NetworkError';
    expect(isTransientNetworkError(error)).toBe(true);
  });

  test('rejects HttpError', () => {
    expect(isTransientNetworkError(new HttpError(400, 'Bad Request', 'nope'))).toBe(false);
  });

  test('rejects plain application errors', () => {
    expect(isTransientNetworkError(new Error('failed to send prompt'))).toBe(false);
  });

  test('rejects clean AbortError', () => {
    const error = new Error('This operation was aborted');
    error.name = 'AbortError';
    expect(isTransientNetworkError(error)).toBe(false);
  });
});

describe('promptSendRetryDelay', () => {
  test('grows exponentially and caps', () => {
    expect(promptSendRetryDelay(0)).toBe(300);
    expect(promptSendRetryDelay(1)).toBe(600);
    expect(promptSendRetryDelay(2)).toBe(1_200);
    expect(promptSendRetryDelay(3)).toBe(2_000);
    expect(PROMPT_SEND_MAX_RETRIES).toBe(3);
  });
});
