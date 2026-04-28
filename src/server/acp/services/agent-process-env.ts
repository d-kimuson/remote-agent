const AGENT_ENV_ALLOWLIST = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CODEX_HOME',
  'CURSOR_API_KEY',
  'GEMINI_API_KEY',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'OPENAI_API_KEY',
  'PATH',
  'PI_API_KEY',
  'SHELL',
  'SSH_AUTH_SOCK',
  'TERM',
  'TMPDIR',
  'USER',
] as const;

export const buildAgentProcessEnv = (
  source: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    AGENT_ENV_ALLOWLIST.flatMap((key) => {
      const value = source[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
