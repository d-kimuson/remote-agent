import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { createHonoApp, honoApp } from './app.ts';
import { envService } from './env.ts';

describe('honoApp', () => {
  test('requires bearer token when RA_API_KEY is configured', async () => {
    process.env['RA_API_KEY'] = 'test-secret';
    envService.resetEnvForTesting();
    try {
      const app = createHonoApp();

      const unauthorized = await app.request('/api/info');
      const authorized = await app.request('/api/info', {
        headers: { authorization: 'Bearer test-secret' },
      });
      const queryTokenRejected = await app.request('/api/info?ra_api_key=test-secret');
      const sseQueryTokenAccepted = await app.request('/api/acp/sse?ra_api_key=test-secret');

      expect(unauthorized.status).toBe(401);
      expect(authorized.status).toBe(200);
      expect(queryTokenRejected.status).toBe(401);
      expect(sseQueryTokenAccepted.status).toBe(200);
    } finally {
      delete process.env['RA_API_KEY'];
      envService.resetEnvForTesting();
    }
  });

  test('rejects requests outside RA_ALLOWED_IPS when configured', async () => {
    process.env['RA_ALLOWED_IPS'] = '192.168.1.10';
    envService.resetEnvForTesting();
    try {
      const app = createHonoApp();

      const rejected = await app.request('/api/info', {
        headers: { 'x-forwarded-for': '10.0.0.2' },
      });
      const accepted = await app.request('/api/info', {
        headers: { 'x-forwarded-for': '192.168.1.10' },
      });

      expect(rejected.status).toBe(403);
      expect(accepted.status).toBe(200);
    } finally {
      delete process.env['RA_ALLOWED_IPS'];
      envService.resetEnvForTesting();
    }
  });

  test('serves configured local CA certificate outside API auth', async () => {
    process.env['RA_API_KEY'] = 'test-secret';
    envService.resetEnvForTesting();
    try {
      const app = createHonoApp({
        trustedCertificate: {
          certificatePem: 'test-ca',
          fileName: 'remote-agent-local-ca.crt',
        },
      });

      const response = await app.request('/.well-known/remote-agent-local-ca.crt');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/x-x509-ca-cert');
      expect(await response.text()).toBe('test-ca');
    } finally {
      delete process.env['RA_API_KEY'];
      envService.resetEnvForTesting();
    }
  });

  test('serves public mobile setup config', async () => {
    const app = createHonoApp({
      mobileSetup: {
        appUrl: 'https://mac.local:4445',
        limitedAppUrl: 'http://192.168.1.8:4445',
        certificateUrl: 'http://192.168.1.8:4445/.well-known/remote-agent-local-ca.crt',
      },
    });

    const response = await app.request('/.well-known/remote-agent-mobile-setup.json');
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      appUrl: 'https://mac.local:4445',
      limitedAppUrl: 'http://192.168.1.8:4445',
      certificateUrl: 'http://192.168.1.8:4445/.well-known/remote-agent-local-ca.crt',
    });
  });

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
        '/api/projects/{projectId}/worktrees': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    required: ['name'],
                    properties: {
                      baseRef: {},
                      branchName: {},
                      name: {},
                    },
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
