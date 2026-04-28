import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type InitializeResponse,
  type SessionInfo,
} from '@agentclientprotocol/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';

import type { ResumableSessionsResponse } from '../../../shared/acp.ts';

import {
  inspectResumeCapabilities,
  mapResumableSessionCandidates,
} from '../session-resume.pure.ts';

type AgentCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
};

type AgentConnection = {
  readonly connection: ClientSideConnection;
  readonly initializeResponse: InitializeResponse;
  readonly cleanup: () => Promise<void>;
};

const createClient = (): Client => {
  return {
    requestPermission: () => {
      const response: Awaited<ReturnType<Client['requestPermission']>> = {
        outcome: {
          outcome: 'selected',
          optionId: 'allow',
        },
      };

      return Promise.resolve(response);
    },
    sessionUpdate: () => Promise.resolve(),
  };
};

const toErrorWithStderr = (error: unknown, stderrChunks: readonly string[]): Error => {
  const stderrText = stderrChunks.join('').trim();
  const message = error instanceof Error ? error.message : String(error);

  if (stderrText.length === 0) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(`${message}\n[agent stderr]\n${stderrText}`);
};

const waitForExit = async (agentProcess: ChildProcessWithoutNullStreams): Promise<void> => {
  if (agentProcess.exitCode !== null || agentProcess.signalCode !== null) {
    return;
  }

  await Promise.race([
    once(agentProcess, 'exit').then(() => undefined),
    new Promise((resolve) => {
      setTimeout(resolve, 500);
    }),
  ]);

  if (agentProcess.exitCode !== null || agentProcess.signalCode !== null) {
    return;
  }

  agentProcess.kill('SIGKILL');
  await once(agentProcess, 'exit');
};

const stopAgentProcess = async (agentProcess: ChildProcessWithoutNullStreams): Promise<void> => {
  agentProcess.stdin.destroy();
  agentProcess.stdout.destroy();
  agentProcess.stderr.destroy();

  if (agentProcess.exitCode === null && agentProcess.signalCode === null) {
    agentProcess.kill();
  }

  await waitForExit(agentProcess);
};

const createAgentConnection = async ({
  command,
  args,
  cwd,
}: AgentCommand): Promise<AgentConnection> => {
  const agentProcess = spawn(command, [...args], {
    cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(process.platform === 'win32' ? { windowsHide: true } : {}),
  });
  const stderrChunks: string[] = [];

  agentProcess.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  if (agentProcess.stdin === null || agentProcess.stdout === null) {
    throw new Error('Failed to spawn agent process with stdio');
  }

  const connection = new ClientSideConnection(
    () => createClient(),
    ndJsonStream(Writable.toWeb(agentProcess.stdin), Readable.toWeb(agentProcess.stdout)),
  );

  try {
    const initializeResponse = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    });

    return {
      connection,
      initializeResponse,
      cleanup: async () => {
        await stopAgentProcess(agentProcess);
      },
    };
  } catch (error) {
    await stopAgentProcess(agentProcess);
    throw toErrorWithStderr(error, stderrChunks);
  }
};

const listAllSessions = async (
  connection: ClientSideConnection,
  cwd: string,
): Promise<readonly SessionInfo[]> => {
  const sessions: SessionInfo[] = [];
  let cursor: string | null | undefined = undefined;

  while (true) {
    const response = await connection.unstable_listSessions({ cursor, cwd });
    sessions.push(...response.sessions);

    if (response.nextCursor === null || response.nextCursor === undefined) {
      return sessions;
    }

    cursor = response.nextCursor;
  }
};

export const discoverResumableSessions = async (
  agentCommand: AgentCommand,
): Promise<ResumableSessionsResponse> => {
  const agentConnection = await createAgentConnection(agentCommand);

  try {
    const capability = inspectResumeCapabilities(
      agentConnection.initializeResponse.agentCapabilities,
    );
    if (!capability.listSessions) {
      return {
        capability,
        sessions: [],
      };
    }

    const sessions = await listAllSessions(agentConnection.connection, agentCommand.cwd);

    return {
      capability,
      sessions: [...mapResumableSessionCandidates(sessions, capability)],
    };
  } finally {
    await agentConnection.cleanup();
  }
};
