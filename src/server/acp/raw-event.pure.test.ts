import { describe, expect, test } from 'vitest';

import { normalizeRawEvent } from './raw-event.pure';

describe('normalizeRawEvent', () => {
  test('normalizes plan payloads', () => {
    const result = normalizeRawEvent({
      type: 'plan',
      entries: [{ text: 'check status' }, { title: 'run command' }],
    });

    expect(result).toEqual({
      type: 'plan',
      entries: ['check status', 'run command'],
      rawText: '{"type":"plan","entries":[{"text":"check status"},{"title":"run command"}]}',
    });
  });

  test('normalizes diff payloads', () => {
    const result = normalizeRawEvent(
      '{"type":"diff","path":"src/index.ts","oldText":"a","newText":"b"}',
    );

    expect(result).toEqual({
      type: 'diff',
      path: 'src/index.ts',
      oldText: 'a',
      newText: 'b',
      rawText: '{"type":"diff","path":"src/index.ts","oldText":"a","newText":"b"}',
    });
  });

  test('ignores unsupported payloads', () => {
    expect(normalizeRawEvent({ type: 'unknown' })).toBeNull();
  });
});
