import { describe, expect, test } from 'vitest';

import type { AgentPreset } from '../../shared/acp.ts';

import {
  inferAuthMethodIdFromCommand,
  resolveProviderAuthMethodId,
} from './provider-auth-method.pure.ts';

describe('provider auth method resolution', () => {
  test('keeps explicitly configured auth method ids', () => {
    const preset: AgentPreset = {
      id: 'codex',
      label: 'Codex',
      description: '',
      command: 'codex-acp',
      args: [],
      authMethodId: 'chatgpt',
    };

    expect(resolveProviderAuthMethodId(preset)).toBe('chatgpt');
  });

  test('infers Codex auth for Custom Providers that directly run codex-acp', () => {
    expect(inferAuthMethodIdFromCommand({ command: '/usr/local/bin/codex-acp', args: [] })).toBe(
      'chatgpt',
    );
  });

  test('infers Codex auth for Custom Providers that run the Codex ACP package through npx', () => {
    expect(
      inferAuthMethodIdFromCommand({
        command: 'npx',
        args: ['-y', '@zed-industries/codex-acp'],
      }),
    ).toBe('chatgpt');
  });

  test('infers Cursor auth for Custom Providers that run Cursor ACP', () => {
    expect(inferAuthMethodIdFromCommand({ command: 'agent', args: ['acp'] })).toBe('cursor_login');
  });

  test('infers OpenCode auth for Custom Providers that run OpenCode ACP', () => {
    expect(inferAuthMethodIdFromCommand({ command: 'opencode', args: ['acp'] })).toBe(
      'opencode-login',
    );
  });

  test('leaves unknown Custom Providers unconfigured', () => {
    expect(inferAuthMethodIdFromCommand({ command: 'custom-agent', args: ['acp'] })).toBe(
      undefined,
    );
  });
});
