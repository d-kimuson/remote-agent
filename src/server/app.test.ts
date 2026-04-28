import { describe, expect, test } from 'vitest';

import { honoApp } from './app.ts';

describe('honoApp', () => {
  test('serves OpenAPI spec for API routes', async () => {
    const response = await honoApp.request('/openapi.json');
    const document: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: {
        title: 'ACP Playground API',
        version: '0.0.0',
      },
      paths: {
        '/api/info': {
          get: {},
        },
        '/api/attachments/ingest': {
          post: {},
        },
        '/api/projects': {
          get: {},
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    required: ['name', 'workingDirectory'],
                  },
                },
              },
            },
          },
        },
        '/api/filesystem/tree': {
          get: {
            parameters: [
              {
                in: 'query',
                name: 'root',
              },
            ],
          },
        },
        '/api/acp/sessions/discover': {
          get: {
            parameters: [
              {
                in: 'query',
                name: 'projectId',
              },
              {
                in: 'query',
                name: 'presetId',
              },
              {
                in: 'query',
                name: 'cwd',
              },
            ],
          },
        },
        '/api/acp/sessions/load': {
          post: {},
        },
        '/api/acp/sessions/{sessionId}/messages': {
          post: {},
        },
      },
    });
  });
});
