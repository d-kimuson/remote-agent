/**
 * ACP セッションを「1 本目の node プロセスで新規」→「2 本目の別プロセスで resume」したとき、
 * session-store と同じ `createACPProvider` オプションで中身が一貫するか段階的に追う。
 *
 * 本番 BFF や DB は通さない。子プロセス（Codex 等）と acp-ai-provider だけを見る。
 *
 * 使い方:
 *   ACP_DEBUG_CWD=/path/to/プロジェクト  \
 *   node --experimental-strip-types src/scripts/debug-acp.ts init
 *
 *   ACP_DEBUG_CWD=同上  \
 *   node --experimental-strip-types src/scripts/debug-acp.ts resume
 *
 * 省略時 `ACP_DEBUG_CWD` は `process.cwd()`。状態ファイルは
 *   `${ACP_DEBUG_CWD}/.acp-debug-state.json`（`ACP_DEBUG_STATE` で上書き可）。
 *
 * 比較用:
 *   ACP_DEBUG_BROKEN_INIT=1  … `initSession` 前に `provider.tools` を読む
 *   （`model` 未生成のため空になり得る。session-store に残っていた不整合の再現用）
 */
import { createACPProvider, type ACPProvider } from '@mcpc-tech/acp-ai-provider';
import { streamText } from 'ai';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { agentPresets } from '../server/acp/presets.ts';
import { resolveCommandPath } from '../server/acp/services/command-path.ts';

const log = (step: string, detail?: Readonly<Record<string, unknown>>) => {
  const line =
    detail === undefined ? `[debug-acp] ${step}` : `[debug-acp] ${step} ${JSON.stringify(detail)}`;
  console.log(line);
};

type DebugStateV1 = {
  readonly v: 1;
  /** BFF 側で保持しているセッション ID（init 応答の sessionId。load に渡す想定） */
  readonly bffSessionId: string;
  /** 初回 `provider.getSessionId()`。ACP 上の表現。 */
  readonly acpSessionIdAfterInit: string | null;
  /** 初回 1 ターン後 `provider.getSessionId()`。 */
  readonly acpSessionIdAfterFirstTurn: string | null;
  readonly cwd: string;
  /** 実際に spawn したコマンド（npx 解決後） */
  readonly command: string;
  readonly createdAt: string;
};

const readDebugStateV1 = (raw: string): DebugStateV1 => {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== 'object') {
    throw new Error('invalid or unsupported state file: run `init` first');
  }
  const o: { readonly [key: string]: unknown } = { ...value };
  if (o['v'] !== 1) {
    throw new Error('invalid or unsupported state file: run `init` first');
  }
  if (typeof o['bffSessionId'] !== 'string') {
    throw new Error('invalid or unsupported state file: run `init` first');
  }
  if (
    typeof o['cwd'] !== 'string' ||
    typeof o['command'] !== 'string' ||
    typeof o['createdAt'] !== 'string'
  ) {
    throw new Error('invalid or unsupported state file: run `init` first');
  }
  const aI = o['acpSessionIdAfterInit'];
  const aT = o['acpSessionIdAfterFirstTurn'];
  if ((aI !== null && typeof aI !== 'string') || (aT !== null && typeof aT !== 'string')) {
    throw new Error('invalid or unsupported state file: run `init` first');
  }
  return {
    v: 1,
    bffSessionId: o['bffSessionId'],
    acpSessionIdAfterInit: aI,
    acpSessionIdAfterFirstTurn: aT,
    cwd: o['cwd'],
    command: o['command'],
    createdAt: o['createdAt'],
  };
};

const preset = agentPresets.find((p) => p.id === 'codex') ?? agentPresets[0];
if (preset === undefined) {
  throw new Error('agentPresets is empty');
}

const defaultStatePath = (cwd: string) =>
  process.env['ACP_DEBUG_STATE'] !== undefined && process.env['ACP_DEBUG_STATE'].length > 0
    ? resolve(process.env['ACP_DEBUG_STATE'])
    : join(cwd, '.acp-debug-state.json');

/** session-store `createProvider` 既定と同じ。 */
const createProviderLikeBff = (options: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly existingSessionId?: string;
}) =>
  createACPProvider({
    command: options.command,
    args: [...options.args],
    authMethodId: preset.authMethodId,
    existingSessionId: options.existingSessionId,
    session: {
      cwd: options.cwd,
      mcpServers: [],
    },
    persistSession: true,
  });

/** 現行 BFF: `initAcpProviderSession`（言語説明: tools は model 生成後に取る方が正しい挙動） */
const initLikeBff = async (provider: ACPProvider) => {
  if (process.env['ACP_DEBUG_BROKEN_INIT'] === '1') {
    // `ACPProvider` は `this.model` なしのとき `get tools` が undefined
    const badTools = provider.tools ?? {};
    return await provider.initSession(badTools);
  }
  provider.languageModel();
  const tools = provider.tools ?? {};
  return await provider.initSession(tools);
};

const oneTurn = async (provider: ACPProvider, label: string, prompt: string) => {
  log(`turn start: ${label}`, { promptPreview: prompt.slice(0, 80) });
  const result = streamText({
    includeRawChunks: true,
    model: provider.languageModel(),
    prompt,
    tools: provider.tools ?? {},
  });
  const text = await result.text;
  const providerSession = provider.getSessionId() ?? null;
  log(`turn end: ${label}`, { textLength: text.length, acpGetSessionId: providerSession });
  return { text, acpGetSessionId: providerSession };
};

const cmdInit = async (cwd: string) => {
  const resolvedNpx = await resolveCommandPath(preset.command);
  if (resolvedNpx === null) {
    throw new Error(`command not on PATH: ${preset.command} (set PATH or use full path)`);
  }
  const statePath = defaultStatePath(cwd);

  log('step 0: env', { cwd, statePath, brokenInit: process.env['ACP_DEBUG_BROKEN_INIT'] === '1' });
  log('step 1: createProvider (no existingSessionId, same as BFF new session)', {
    command: resolvedNpx,
    args: preset.args,
  });

  const provider = createProviderLikeBff({
    command: resolvedNpx,
    args: preset.args,
    cwd,
  });

  const initRes = await initLikeBff(provider);
  const bffId = initRes.sessionId;
  if (bffId === undefined || bffId.length === 0) {
    throw new Error('initSession response missing sessionId');
  }
  const afterInit = provider.getSessionId() ?? null;
  log('step 2: after initSession', { bffResponseSessionId: bffId, getSessionId: afterInit });

  const { acpGetSessionId: afterFirst } = await oneTurn(
    provider,
    'first process / first user turn',
    'debug-acp: 1 本目のメッセージ。あとで同じ ACP セッションの続きかどうか見る。',
  );

  const state: DebugStateV1 = {
    v: 1,
    bffSessionId: bffId,
    acpSessionIdAfterInit: afterInit,
    acpSessionIdAfterFirstTurn: afterFirst,
    cwd,
    command: resolvedNpx,
    createdAt: new Date().toISOString(),
  };
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
  log('step 3: wrote state file', { statePath });
  log('next: 別プロセスで同じ CWD かつ ACP_DEBUG_CWD を合わせて `resume` を実行', {
    example: `ACP_DEBUG_CWD=${cwd} node --experimental-strip-types src/scripts/debug-acp.ts resume`,
  });

  provider.cleanup();
};

const cmdResume = async (cwd: string) => {
  const statePath = defaultStatePath(cwd);
  const raw = await readFile(statePath, 'utf8');
  const state = readDebugStateV1(raw);
  if (resolve(state.cwd) !== resolve(cwd)) {
    log('warning: ACP_DEBUG_CWD differs from state.cwd', { envCwd: cwd, stateCwd: state.cwd });
  }

  const resolvedNpx = await resolveCommandPath(preset.command);
  if (resolvedNpx === null) {
    throw new Error(`command not on PATH: ${preset.command}`);
  }

  log('step 0: env', { cwd, statePath, brokenInit: process.env['ACP_DEBUG_BROKEN_INIT'] === '1' });
  log('step 1: load state', {
    bffSessionId: state.bffSessionId,
    firstRunAcpIdAfterInit: state.acpSessionIdAfterInit,
    firstRunAcpIdAfterFirstTurn: state.acpSessionIdAfterFirstTurn,
  });

  log('step 2: createProvider (WITH existingSessionId = bffSessionId, same as BFF loadSession)', {
    command: state.command,
    args: preset.args,
    existingSessionId: state.bffSessionId,
  });
  const provider = createProviderLikeBff({
    command: state.command,
    args: preset.args,
    cwd,
    existingSessionId: state.bffSessionId,
  });

  const initRes = await initLikeBff(provider);
  const bffIdFromSecondInit = initRes.sessionId;
  const afterInit = provider.getSessionId() ?? null;
  log('step 3: after second process initSession (load)', {
    bffResponseSessionId: bffIdFromSecondInit,
    getSessionId: afterInit,
    bffIdMatchesLoadParam: bffIdFromSecondInit === state.bffSessionId,
  });

  if (afterInit !== null && afterInit !== state.bffSessionId) {
    log('NOTE: getSessionId() != state.bffSessionId (compare with first run column)', {
      afterInit,
      expectedBff: state.bffSessionId,
    });
  }

  const { acpGetSessionId: afterSecond } = await oneTurn(
    provider,
    'second process / second user turn (resume)',
    'debug-acp: 2 本目。直前の会話を前提に短く返せるなら、agent 上は同一会話のはず。',
  );

  log('step 4: summary (compare columns manually)', {
    '1st bff (state)': state.bffSessionId,
    '1st ACP getSessionId@after1stTurn': state.acpSessionIdAfterFirstTurn,
    '2nd bff@init': bffIdFromSecondInit,
    '2nd ACP getSessionId@afterInit': afterInit,
    '2nd ACP getSessionId@after2ndTurn': afterSecond,
  });

  provider.cleanup();
};

const main = async () => {
  const sub = process.argv[2] ?? 'help';
  const cwd =
    process.env['ACP_DEBUG_CWD'] !== undefined && process.env['ACP_DEBUG_CWD'].length > 0
      ? resolve(process.env['ACP_DEBUG_CWD'])
      : process.cwd();

  if (sub === 'init') {
    await cmdInit(cwd);
    return;
  }
  if (sub === 'resume') {
    await cmdResume(cwd);
    return;
  }
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    printUsage();
    return;
  }

  console.error(`[debug-acp] unknown subcommand: ${sub}`);
  printUsage();
  process.exitCode = 1;
  return;
};

const printUsage = () => {
  console.log(`Usage:
  ACP_DEBUG_CWD=<project dir, optional: default cwd> node --experimental-strip-types src/scripts/debug-acp.ts init
  ACP_DEBUG_CWD=<same> node --experimental-strip-types src/scripts/debug-acp.ts resume

Env:
  ACP_DEBUG_STATE=path   Override state file (default: <cwd>/.acp-debug-state.json)
  ACP_DEBUG_BROKEN_INIT=1  Call init with tools read before languageModel (for comparison)
`);
};

void main().catch((err: unknown) => {
  console.error('[debug-acp] error:', err);
  process.exitCode = 1;
});
