import { describe, expect, test } from 'vitest';

import { agentPresets } from './presets.ts';

describe('agentPresets', () => {
  test('keeps auth method ids with preset definitions for auth-backed providers', () => {
    expect(agentPresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'codex',
          authMethodId: 'chatgpt',
        }),
        expect.objectContaining({
          id: 'copilot-cli',
          authMethodId: 'copilot-login',
        }),
        expect.objectContaining({
          id: 'pi-coding-agent',
          authMethodId: 'pi_terminal_login',
        }),
      ]),
    );
  });
});
