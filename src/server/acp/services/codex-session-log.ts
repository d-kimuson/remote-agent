import { opendir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type { ChatMessage } from '../../../shared/acp.ts';

import {
  parseClaudeCodeSessionLogText,
  parseCodexSessionLogText,
  parsePiCodingAgentSessionLogText,
} from '../codex-session-log.pure.ts';

const defaultCodexSessionsDirectory = (): string => path.join(homedir(), '.codex', 'sessions');
const defaultClaudeCodeProjectsDirectory = (): string =>
  path.join(homedir(), '.claude', 'projects');
const defaultPiAgentSessionsDirectory = (): string =>
  path.join(homedir(), '.pi', 'agent', 'sessions');

const findCodexSessionLogFile = async (
  sessionId: string,
  directory: string,
): Promise<string | null> => {
  let entries;
  try {
    entries = await opendir(directory);
  } catch {
    return null;
  }

  for await (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findCodexSessionLogFile(sessionId, entryPath);
      if (nested !== null) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith('.jsonl')) {
      return entryPath;
    }
  }

  return null;
};

const readSessionLogMessages = async ({
  directory,
  parser,
  sessionId,
}: {
  readonly directory: string;
  readonly parser: (
    text: string,
    fallbackSessionId: string,
  ) => { readonly messages: readonly ChatMessage[] };
  readonly sessionId: string;
}): Promise<readonly ChatMessage[]> => {
  const filePath = await findCodexSessionLogFile(sessionId, directory);
  if (filePath === null) {
    return [];
  }

  const text = await readFile(filePath, 'utf8');
  return parser(text, sessionId).messages;
};

export const importProviderSessionMessages = async (
  presetId: string,
  sessionId: string,
): Promise<readonly ChatMessage[]> => {
  if (presetId === 'codex') {
    return await readSessionLogMessages({
      directory: defaultCodexSessionsDirectory(),
      parser: parseCodexSessionLogText,
      sessionId,
    });
  }

  if (presetId === 'claude-code') {
    return await readSessionLogMessages({
      directory: defaultClaudeCodeProjectsDirectory(),
      parser: parseClaudeCodeSessionLogText,
      sessionId,
    });
  }

  if (presetId === 'pi-coding-agent') {
    return await readSessionLogMessages({
      directory: defaultPiAgentSessionsDirectory(),
      parser: parsePiCodingAgentSessionLogText,
      sessionId,
    });
  }

  return [];
};
