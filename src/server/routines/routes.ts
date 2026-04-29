import { Hono } from 'hono';
import { describeRoute, validator as vValidator } from 'hono-openapi';
import { parse } from 'valibot';

import {
  createRoutineRequestSchema,
  routinesResponseSchema,
  updateRoutineRequestSchema,
} from '../../shared/acp.ts';
import { errorResponseSchema, jsonResponse, validationErrorHook } from '../hono-utils.ts';
import { createRoutine, deleteRoutine, listRoutines, updateRoutine } from './routine-store.ts';

export const routineRoutes = new Hono()
  .get(
    '/',
    describeRoute({
      summary: 'List routines',
      responses: { 200: jsonResponse('Routines', routinesResponseSchema) },
    }),
    async (c) => {
      const response = parse(routinesResponseSchema, { routines: await listRoutines() });
      return c.json(response);
    },
  )
  .post(
    '/',
    describeRoute({
      summary: 'Create routine',
      responses: {
        201: jsonResponse('Routines', routinesResponseSchema),
        400: jsonResponse('Routine creation error', errorResponseSchema),
      },
    }),
    vValidator('json', createRoutineRequestSchema, validationErrorHook),
    async (c) => {
      try {
        await createRoutine(c.req.valid('json'));
        return c.json(parse(routinesResponseSchema, { routines: await listRoutines() }), 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to create routine';
        return c.json({ error: message }, 400);
      }
    },
  )
  .patch(
    '/:routineId',
    describeRoute({
      summary: 'Update routine',
      responses: {
        200: jsonResponse('Routines', routinesResponseSchema),
        400: jsonResponse('Routine update error', errorResponseSchema),
        404: jsonResponse('Routine not found', errorResponseSchema),
      },
    }),
    vValidator('json', updateRoutineRequestSchema, validationErrorHook),
    async (c) => {
      try {
        await updateRoutine(c.req.param('routineId'), c.req.valid('json'));
        return c.json(parse(routinesResponseSchema, { routines: await listRoutines() }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to update routine';
        return c.json({ error: message }, message.startsWith('Routine not found:') ? 404 : 400);
      }
    },
  )
  .delete(
    '/:routineId',
    describeRoute({
      summary: 'Delete routine',
      responses: {
        200: jsonResponse('Routines', routinesResponseSchema),
        404: jsonResponse('Routine not found', errorResponseSchema),
      },
    }),
    async (c) => {
      const ok = await deleteRoutine(c.req.param('routineId'));
      if (!ok) {
        return c.json({ error: 'Routine not found' }, 404);
      }
      return c.json(parse(routinesResponseSchema, { routines: await listRoutines() }));
    },
  );
