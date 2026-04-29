import type { RoutineConfig } from '../../shared/acp.ts';

type CronFieldSpec = {
  readonly min: number;
  readonly max: number;
  readonly normalize?: (value: number) => number;
};

type ParsedCron = {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly daysOfMonth: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly daysOfWeek: ReadonlySet<number>;
};

const cronFieldSpecs = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7, normalize: (value: number) => (value === 7 ? 0 : value) },
] as const satisfies readonly CronFieldSpec[];

const parseInteger = (value: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid cron field value: ${value}`);
  }
  return Number(value);
};

const normalizeFieldValue = (value: number, spec: CronFieldSpec): number => {
  if (value < spec.min || value > spec.max) {
    throw new Error(`Cron field value out of range: ${String(value)}`);
  }
  return spec.normalize?.(value) ?? value;
};

const expandRange = ({
  end,
  spec,
  start,
  step,
}: {
  readonly spec: CronFieldSpec;
  readonly start: number;
  readonly end: number;
  readonly step: number;
}): readonly number[] => {
  if (step <= 0) {
    throw new Error('Cron step must be greater than 0');
  }
  if (start > end) {
    throw new Error('Cron ranges must be ascending');
  }

  const values: number[] = [];
  for (let value = start; value <= end; value += step) {
    values.push(normalizeFieldValue(value, spec));
  }
  return values;
};

const expandCronPart = (part: string, spec: CronFieldSpec): readonly number[] => {
  const [rangeText, stepText] = part.split('/');
  const step = stepText === undefined ? 1 : parseInteger(stepText);

  if (rangeText === undefined || rangeText.length === 0) {
    throw new Error('Cron field cannot be empty');
  }

  if (rangeText === '*') {
    return expandRange({ spec, start: spec.min, end: spec.max, step });
  }

  const [startText, endText] = rangeText.split('-');
  if (startText === undefined || startText.length === 0) {
    throw new Error('Cron range start cannot be empty');
  }

  const start = parseInteger(startText);
  const end = endText === undefined ? start : parseInteger(endText);
  return expandRange({ spec, start, end, step });
};

const parseCronField = (field: string, spec: CronFieldSpec): ReadonlySet<number> => {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    for (const value of expandCronPart(part, spec)) {
      values.add(value);
    }
  }
  if (values.size === 0) {
    throw new Error('Cron field must include at least one value');
  }
  return values;
};

export const parseCronExpression = (expression: string): ParsedCron => {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron expression must have 5 fields');
  }

  return {
    minutes: parseCronField(fields[0] ?? '', cronFieldSpecs[0]),
    hours: parseCronField(fields[1] ?? '', cronFieldSpecs[1]),
    daysOfMonth: parseCronField(fields[2] ?? '', cronFieldSpecs[2]),
    months: parseCronField(fields[3] ?? '', cronFieldSpecs[3]),
    daysOfWeek: parseCronField(fields[4] ?? '', cronFieldSpecs[4]),
  };
};

const nextMinute = (date: Date): Date => {
  const next = new Date(date.getTime());
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);
  return next;
};

const matchesCron = (date: Date, cron: ParsedCron): boolean =>
  cron.minutes.has(date.getUTCMinutes()) &&
  cron.hours.has(date.getUTCHours()) &&
  cron.daysOfMonth.has(date.getUTCDate()) &&
  cron.months.has(date.getUTCMonth() + 1) &&
  cron.daysOfWeek.has(date.getUTCDay());

export const nextCronRunAt = (expression: string, after: Date): string => {
  const cron = parseCronExpression(expression);
  const maxIterations = 60 * 24 * 366 * 5;
  let cursor = nextMinute(after);

  for (let index = 0; index < maxIterations; index += 1) {
    if (matchesCron(cursor, cron)) {
      return cursor.toISOString();
    }
    cursor = nextMinute(cursor);
  }

  throw new Error('Unable to find next cron run within 5 years');
};

export const nextRoutineRunAt = ({
  config,
  enabled,
  now,
}: {
  readonly config: RoutineConfig;
  readonly enabled: boolean;
  readonly now: Date;
}): string | null => {
  if (!enabled) {
    return null;
  }

  if ('cronExpression' in config) {
    return nextCronRunAt(config.cronExpression, now);
  }

  const runAt = new Date(config.runAt);
  if (Number.isNaN(runAt.getTime())) {
    throw new Error('Scheduled runAt must be a valid date');
  }
  return runAt.toISOString();
};
