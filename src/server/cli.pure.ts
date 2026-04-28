export type CliOptions = Readonly<{
  serverOnly: boolean;
}>;

type CliParseResult =
  | Readonly<{
      type: 'success';
      value: CliOptions;
    }>
  | Readonly<{
      type: 'help';
      usage: string;
    }>
  | Readonly<{
      type: 'error';
      message: string;
      usage: string;
    }>;

const usage = 'Usage: remote-agent [--server-only]';

export const parseCliArgs = (args: readonly string[]): CliParseResult => {
  let serverOnly = false;

  for (const arg of args) {
    if (arg === '--server-only') {
      serverOnly = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { type: 'help', usage };
    }

    return {
      type: 'error',
      message: `Unknown argument: ${arg}`,
      usage,
    };
  }

  return {
    type: 'success',
    value: { serverOnly },
  };
};
