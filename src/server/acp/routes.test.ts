import { describe, expect, test } from 'vitest';

import { honoApp } from '../app.ts';

describe('acpRoutes', () => {
  test('exposes supported agent presets in app info', async () => {
    const response = await honoApp.request('/api/info');
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agentPresets: [
        {
          id: 'codex',
          label: 'Codex',
          command: 'codex-acp',
          modelSelectLabel: 'Model / Effort',
        },
        {
          id: 'claude-code',
          label: 'Claude Code',
          command: 'claude-agent-acp',
        },
        {
          id: 'copilot-cli',
          label: 'Copilot CLI',
          command: 'copilot',
        },
        {
          id: 'pi-coding-agent',
          label: 'pi-coding-agent',
          command: 'pi-acp',
        },
        {
          id: 'cursor-cli',
          label: 'Cursor CLI',
          command: 'agent',
        },
      ],
    });
  });

  test('returns 404 for unknown project on agent model catalog', async () => {
    const response = await honoApp.request(
      '/api/acp/agent/model-catalog?projectId=__no_such_project__&presetId=codex',
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      error: 'Unknown project: __no_such_project__',
    });
  });

  test('exposes ACP session SSE with event-stream content type', async () => {
    const ac = new AbortController();
    setTimeout(() => {
      ac.abort();
    }, 0);
    const response = await honoApp.request('/api/acp/sse', { signal: ac.signal });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
  });

  test('rejects session creation requests for unknown presets', async () => {
    const response = await honoApp.request('/api/acp/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: null,
        presetId: 'unknown-agent',
        command: null,
        argsText: '',
        cwd: null,
      }),
    });
    const payload: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: 'Unknown ACP provider preset: unknown-agent',
    });
  });
});
