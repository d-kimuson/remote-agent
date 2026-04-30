import { Hono } from 'hono';
import { describeRoute, validator as vValidator } from 'hono-openapi';
import { parse } from 'valibot';

import {
  createProjectWorktreeRequestSchema,
  createProjectRequestSchema,
  projectResponseSchema,
  projectSettingsResponseSchema,
  projectWorktreeResponseSchema,
  projectsResponseSchema,
  updateProjectSettingsRequestSchema,
  updateProjectModelPreferenceRequestSchema,
  updateProjectModePreferenceRequestSchema,
  gitDiffRequestSchema,
  gitDiffResponseSchema,
  gitRevisionsRequestSchema,
  gitRevisionsResponseSchema,
} from '../../shared/acp.ts';
import { errorResponseSchema, jsonResponse, validationErrorHook } from '../hono-utils.ts';
import { getGitDiff, getGitRevisions } from './git-store.ts';
import {
  createProject,
  getProject,
  getProjectSettings,
  listProjects,
  updateProjectSettings,
  updateProjectModelPreference,
  updateProjectModePreference,
} from './project-store.ts';
import { createProjectWorktree } from './worktree-store.ts';

export const projectRoutes = new Hono()
  .get(
    '/',
    describeRoute({
      summary: 'List projects',
      responses: { 200: jsonResponse('Projects', projectsResponseSchema) },
    }),
    async (c) => {
      const response = parse(projectsResponseSchema, { projects: await listProjects() });
      return c.json(response);
    },
  )
  .post(
    '/',
    describeRoute({
      summary: 'Create project',
      responses: {
        201: jsonResponse('Created project', projectResponseSchema),
        400: jsonResponse('Project creation error', errorResponseSchema),
      },
    }),
    vValidator('json', createProjectRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid('json');
        const response = parse(projectResponseSchema, { project: await createProject(request) });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to create project';
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    '/:projectId',
    describeRoute({
      summary: 'Get project',
      responses: {
        200: jsonResponse('Project', projectResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    async (c) => {
      try {
        const response = parse(projectResponseSchema, {
          project: await getProject(c.req.param('projectId')),
        });
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to read project';
        return c.json({ error: message }, 404);
      }
    },
  )
  .post(
    '/:projectId/worktrees',
    describeRoute({
      summary: 'Create project worktree',
      responses: {
        201: jsonResponse('Created project worktree', projectWorktreeResponseSchema),
        400: jsonResponse('Project worktree creation error', errorResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    vValidator('json', createProjectWorktreeRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(projectWorktreeResponseSchema, {
          worktree: await createProjectWorktree(c.req.param('projectId'), c.req.valid('json')),
        });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to create worktree';
        if (message.startsWith('Unknown project:')) {
          return c.json({ error: message }, 404);
        }
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    '/:projectId/git/revisions',
    describeRoute({
      summary: 'Get project git revisions',
      responses: {
        200: jsonResponse('Git revisions', gitRevisionsResponseSchema),
        400: jsonResponse('Git revisions error', errorResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    vValidator('query', gitRevisionsRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(
          gitRevisionsResponseSchema,
          await getGitRevisions(c.req.param('projectId'), c.req.valid('query')),
        );
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to read git revisions';
        if (message.startsWith('Unknown project:')) {
          return c.json({ error: message }, 404);
        }
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    '/:projectId/git/diff',
    describeRoute({
      summary: 'Get project git diff',
      responses: {
        200: jsonResponse('Git diff', gitDiffResponseSchema),
        400: jsonResponse('Git diff error', errorResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    vValidator('json', gitDiffRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(
          gitDiffResponseSchema,
          await getGitDiff(c.req.param('projectId'), c.req.valid('json')),
        );
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to read git diff';
        if (message.startsWith('Unknown project:')) {
          return c.json({ error: message }, 404);
        }
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    '/:projectId/settings',
    describeRoute({
      summary: 'Get project settings',
      responses: {
        200: jsonResponse('Project settings', projectSettingsResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    async (c) => {
      try {
        const response = parse(projectSettingsResponseSchema, {
          settings: await getProjectSettings(c.req.param('projectId')),
        });
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to read project settings';
        return c.json({ error: message }, 404);
      }
    },
  )
  .patch(
    '/:projectId/settings',
    describeRoute({
      summary: 'Update project settings',
      responses: {
        200: jsonResponse('Project settings', projectSettingsResponseSchema),
        400: jsonResponse('Project settings update error', errorResponseSchema),
        404: jsonResponse('Project not found', errorResponseSchema),
      },
    }),
    vValidator('json', updateProjectSettingsRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(projectSettingsResponseSchema, {
          settings: await updateProjectSettings(c.req.param('projectId'), c.req.valid('json')),
        });
        return c.json(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'failed to update project settings';
        if (message.startsWith('Unknown project:')) {
          return c.json({ error: message }, 404);
        }
        return c.json({ error: message }, 400);
      }
    },
  )
  .patch(
    '/:projectId/model-preferences',
    describeRoute({
      summary: 'Update project model preferences',
      responses: {
        200: jsonResponse('Project settings', projectSettingsResponseSchema),
        400: jsonResponse('Project settings update error', errorResponseSchema),
      },
    }),
    vValidator('json', updateProjectModelPreferenceRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(projectSettingsResponseSchema, {
          settings: await updateProjectModelPreference(
            c.req.param('projectId'),
            c.req.valid('json'),
          ),
        });
        return c.json(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'failed to update project settings';
        return c.json({ error: message }, 400);
      }
    },
  )
  .patch(
    '/:projectId/mode-preferences',
    describeRoute({
      summary: 'Update project mode preferences',
      responses: {
        200: jsonResponse('Project settings', projectSettingsResponseSchema),
        400: jsonResponse('Project settings update error', errorResponseSchema),
      },
    }),
    vValidator('json', updateProjectModePreferenceRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(projectSettingsResponseSchema, {
          settings: await updateProjectModePreference(
            c.req.param('projectId'),
            c.req.valid('json'),
          ),
        });
        return c.json(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'failed to update project settings';
        return c.json({ error: message }, 400);
      }
    },
  );
