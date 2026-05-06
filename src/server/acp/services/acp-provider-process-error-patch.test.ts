import { createACPProvider } from '@mcpc-tech/acp-ai-provider';
import { describe, expect, test } from 'vitest';

import { installAcpProviderProcessErrorPatch } from './acp-provider-process-error-patch.ts';

describe('installAcpProviderProcessErrorPatch', () => {
  test('turns ACP provider spawn errors into rejected promises instead of process crashes', async () => {
    installAcpProviderProcessErrorPatch();
    const provider = createACPProvider({
      command: '/definitely/missing/remote-agent-acp',
      args: [],
      session: {
        cwd: process.cwd(),
        mcpServers: [],
      },
      persistSession: false,
    });

    await expect(provider.connect()).rejects.toThrow('Failed to start ACP provider process');
    provider.cleanup();
  });
});
