import { describe, expect, test } from 'vitest';

import { nextCronRunAt, nextRoutineRunAt, parseCronExpression } from './routine-schedule.pure.ts';

describe('routine schedule helpers', () => {
  test('parses five-field cron expressions with ranges, lists, steps, and sunday aliases', () => {
    const cron = parseCronExpression('*/15 9-17 * 1,6 0,7');

    expect(cron.minutes.has(0)).toBe(true);
    expect(cron.minutes.has(15)).toBe(true);
    expect(cron.minutes.has(14)).toBe(false);
    expect(cron.hours.has(9)).toBe(true);
    expect(cron.hours.has(18)).toBe(false);
    expect(cron.months.has(1)).toBe(true);
    expect(cron.months.has(6)).toBe(true);
    expect(cron.daysOfWeek.has(0)).toBe(true);
  });

  test('calculates next cron run in UTC', () => {
    const nextRunAt = nextCronRunAt('30 9 * * *', new Date('2026-04-29T09:29:40.000Z'));

    expect(nextRunAt).toBe('2026-04-29T09:30:00.000Z');
  });

  test('moves to the next day when todays cron slot has passed', () => {
    const nextRunAt = nextCronRunAt('30 9 * * *', new Date('2026-04-29T09:30:00.000Z'));

    expect(nextRunAt).toBe('2026-04-30T09:30:00.000Z');
  });

  test('returns null when a routine is disabled', () => {
    const nextRunAt = nextRoutineRunAt({
      config: { runAt: '2026-04-29T10:00:00.000Z' },
      enabled: false,
      now: new Date('2026-04-29T09:00:00.000Z'),
    });

    expect(nextRunAt).toBeNull();
  });
});
