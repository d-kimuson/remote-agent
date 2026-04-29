import { asc, eq, lte } from 'drizzle-orm';
import { array, parse } from 'valibot';

import {
  createRoutineRequestSchema,
  routineConfigSchema,
  routineSchema,
  routineSendConfigSchema,
  updateRoutineRequestSchema,
  type CreateRoutineRequest,
  type Routine,
  type UpdateRoutineRequest,
} from '../../shared/acp.ts';
import { routinesTable } from '../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../db/sqlite.ts';
import { nextRoutineRunAt } from './routine-schedule.pure.ts';

const parseBooleanText = (value: string): boolean => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`Invalid boolean text: ${value}`);
};

const parseJson = (value: string): unknown => JSON.parse(value);

const mapRoutineRecord = (record: typeof routinesTable.$inferSelect): Routine => {
  return parse(routineSchema, {
    id: record.id,
    name: record.name,
    enabled: parseBooleanText(record.enabled),
    kind: record.kind,
    config: parse(routineConfigSchema, parseJson(record.configJson)),
    sendConfig: parse(routineSendConfigSchema, parseJson(record.sendConfigJson)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastRunAt: record.lastRunAt,
    nextRunAt: record.nextRunAt,
    lastError: record.lastError,
  });
};

const normalizeCreateRequest = (request: CreateRoutineRequest): CreateRoutineRequest =>
  parse(createRoutineRequestSchema, request);

const normalizeUpdateRequest = (request: UpdateRoutineRequest): UpdateRoutineRequest =>
  parse(updateRoutineRequestSchema, request);

export const createRoutineStore = (database: AppDatabase = getDefaultDatabase()) => {
  const listRoutines = async (): Promise<readonly Routine[]> => {
    const records = await database.db.select().from(routinesTable).orderBy(asc(routinesTable.name));
    return parse(array(routineSchema), records.map(mapRoutineRecord));
  };

  const getRoutine = async (routineId: string): Promise<Routine> => {
    const [record] = await database.db
      .select()
      .from(routinesTable)
      .where(eq(routinesTable.id, routineId))
      .limit(1);
    if (record === undefined) {
      throw new Error(`Routine not found: ${routineId}`);
    }
    return mapRoutineRecord(record);
  };

  const createRoutine = async (requestInput: CreateRoutineRequest): Promise<Routine> => {
    const request = normalizeCreateRequest(requestInput);
    const now = new Date();
    const enabled = request.enabled ?? true;
    const nextRunAt = nextRoutineRunAt({ config: request.config, enabled, now });
    const routine = parse(routineSchema, {
      id: crypto.randomUUID(),
      name: request.name,
      enabled,
      kind: request.kind,
      config: request.config,
      sendConfig: request.sendConfig,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastRunAt: null,
      nextRunAt,
      lastError: null,
    });

    await database.db.insert(routinesTable).values({
      id: routine.id,
      name: routine.name,
      enabled: routine.enabled ? 'true' : 'false',
      kind: routine.kind,
      configJson: JSON.stringify(routine.config),
      sendConfigJson: JSON.stringify(routine.sendConfig),
      createdAt: routine.createdAt,
      updatedAt: routine.updatedAt,
      lastRunAt: routine.lastRunAt,
      nextRunAt: routine.nextRunAt,
      lastError: routine.lastError,
    });

    return routine;
  };

  const updateRoutine = async (
    routineId: string,
    requestInput: UpdateRoutineRequest,
  ): Promise<Routine> => {
    const request = normalizeUpdateRequest(requestInput);
    const current = await getRoutine(routineId);
    const now = new Date();
    const next = parse(routineSchema, {
      ...current,
      ...request,
      kind: request.kind ?? current.kind,
      updatedAt: now.toISOString(),
      nextRunAt: nextRoutineRunAt({
        config: request.config ?? current.config,
        enabled: request.enabled ?? current.enabled,
        now,
      }),
      lastError: null,
    });

    await database.db
      .update(routinesTable)
      .set({
        name: next.name,
        enabled: next.enabled ? 'true' : 'false',
        kind: next.kind,
        configJson: JSON.stringify(next.config),
        sendConfigJson: JSON.stringify(next.sendConfig),
        updatedAt: next.updatedAt,
        nextRunAt: next.nextRunAt,
        lastError: next.lastError,
      })
      .where(eq(routinesTable.id, routineId));

    return next;
  };

  const deleteRoutine = async (routineId: string): Promise<boolean> => {
    const existing = await database.db
      .select({ id: routinesTable.id })
      .from(routinesTable)
      .where(eq(routinesTable.id, routineId))
      .limit(1);
    if (existing.length === 0) {
      return false;
    }

    await database.db.delete(routinesTable).where(eq(routinesTable.id, routineId));
    return true;
  };

  const listDueRoutines = async (now: Date): Promise<readonly Routine[]> => {
    const records = await database.db
      .select()
      .from(routinesTable)
      .where(lte(routinesTable.nextRunAt, now.toISOString()));
    return parse(
      array(routineSchema),
      records
        .map(mapRoutineRecord)
        .filter((routine) => routine.enabled && routine.nextRunAt !== null),
    );
  };

  const markRoutineRunCompleted = async ({
    error,
    routineId,
    runAt,
  }: {
    readonly routineId: string;
    readonly runAt: Date;
    readonly error: string | null;
  }): Promise<Routine> => {
    const current = await getRoutine(routineId);
    const completedAt = runAt.toISOString();
    const nextEnabled = current.kind === 'scheduled' ? false : current.enabled;
    const next = parse(routineSchema, {
      ...current,
      enabled: nextEnabled,
      updatedAt: completedAt,
      lastRunAt: completedAt,
      lastError: error,
      nextRunAt:
        error === null
          ? nextRoutineRunAt({ config: current.config, enabled: nextEnabled, now: runAt })
          : null,
    });

    await database.db
      .update(routinesTable)
      .set({
        enabled: next.enabled ? 'true' : 'false',
        updatedAt: next.updatedAt,
        lastRunAt: next.lastRunAt,
        nextRunAt: next.nextRunAt,
        lastError: next.lastError,
      })
      .where(eq(routinesTable.id, routineId));

    return next;
  };

  return {
    listRoutines,
    getRoutine,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    listDueRoutines,
    markRoutineRunCompleted,
  };
};

let defaultRoutineStore: ReturnType<typeof createRoutineStore> | undefined = undefined;

const getRoutineStore = () => {
  defaultRoutineStore ??= createRoutineStore();
  return defaultRoutineStore;
};

export const listRoutines = async (): Promise<readonly Routine[]> =>
  getRoutineStore().listRoutines();

export const createRoutine = async (request: CreateRoutineRequest): Promise<Routine> =>
  getRoutineStore().createRoutine(request);

export const updateRoutine = async (
  routineId: string,
  request: UpdateRoutineRequest,
): Promise<Routine> => getRoutineStore().updateRoutine(routineId, request);

export const deleteRoutine = async (routineId: string): Promise<boolean> =>
  getRoutineStore().deleteRoutine(routineId);
