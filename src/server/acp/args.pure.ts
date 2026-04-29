export const parseArgsText = (value: string | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }

  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export type ParsedCommandLine =
  | {
      readonly ok: true;
      readonly command: string;
      readonly args: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export const parseCommandLine = (value: string): ParsedCommandLine => {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of value.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    return { ok: false, error: 'Command must not end with an unfinished escape sequence.' };
  }

  if (quote !== null) {
    return { ok: false, error: 'Command has an unterminated quote.' };
  }

  if (current.length > 0) {
    parts.push(current);
  }

  const [command, ...args] = parts;
  if (command === undefined || command.length === 0) {
    return { ok: false, error: 'Command is required.' };
  }

  return { ok: true, command, args };
};
