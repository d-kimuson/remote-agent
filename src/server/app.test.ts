import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { createHonoApp, honoApp } from './app.ts';

describe('honoApp', () => {
  test('serves OpenAPI spec for API routes', async () => {
    const response = await honoApp.request('/api/openapi.json');
    const document: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: {
        title: 'Remote Agent API',
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

  test('serves client build assets and SPA fallback when client build is configured', async () => {
    const clientBuildDirectory = mkdtempSync(path.join(tmpdir(), 'remote-agent-client-'));
    writeFileSync(path.join(clientBuildDirectory, 'index.html'), '<html><body>spa</body></html>');
    writeFileSync(path.join(clientBuildDirectory, 'app.js'), 'console.log("asset");');

    try {
      const app = createHonoApp({ clientBuildDirectory });

      const indexResponse = await app.request('/');
      const assetResponse = await app.request('/app.js');
      const fallbackResponse = await app.request('/projects/123');

      expect(indexResponse.status).toBe(200);
      expect(await indexResponse.text()).toContain('spa');

      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toContain('asset');

      expect(fallbackResponse.status).toBe(200);
      expect(await fallbackResponse.text()).toContain('spa');
    } finally {
      rmSync(clientBuildDirectory, { recursive: true, force: true });
    }
  });
});
