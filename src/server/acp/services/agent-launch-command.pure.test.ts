import { describe, expect, test } from 'vitest';

import { buildAgentLaunchCommand } from './agent-launch-command.pure.ts';

describe('buildAgentLaunchCommand', () => {
  test('uses provider command directly', () => {
    const launch = buildAgentLaunchCommand({
      providerCommand: '/missing/codex-acp',
      providerArgs: ['--stdio'],
      cwd: '/repo',
    });

    expect(launch.command).toBe('/missing/codex-acp');
    expect(launch.args).toEqual(['--stdio']);
  });

  test('preserves sandbox launch command', () => {
    const launch = buildAgentLaunchCommand({
      providerCommand: '/bin/codex-acp',
      providerArgs: [],
      cwd: '/repo',
      sandbox: {
        sandboxedCommand: 'codex-acp',
      },
    });

    expect(launch.command).toBe(
      process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'bash',
    );
    expect(launch.args).toEqual(
      process.platform === 'win32' ? ['/d', '/s', '/c', 'codex-acp'] : ['-lc', 'codex-acp'],
    );
    expect(launch.cwd).toBe('/repo');
  });
});
