import {
  array,
  literal,
  number,
  object,
  optional,
  pipe,
  safeParse,
  string,
  trim,
  union,
  unknown,
  type InferOutput,
} from 'valibot';

import type { RawEvent } from '../../../../shared/acp.ts';
import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

const textContentSchema = object({
  type: literal('text'),
  text: string(),
});

const contentTextOutputSchema = object({
  content: string(),
});

const contentArrayOutputSchema = object({
  content: array(union([textContentSchema, object({ type: string() })])),
});

const dynamicToolInputSchema = object({
  toolName: pipe(string(), trim()),
  args: optional(unknown()),
});

const toolCallRawSchema = object({
  input: dynamicToolInputSchema,
});

const toolCallInputTextSchema = object({
  toolName: pipe(string(), trim()),
  args: optional(unknown()),
});

const toolResultRawSchema = object({
  input: dynamicToolInputSchema,
  output: unknown(),
});

const execResultSchema = object({
  command: optional(array(string())),
  cwd: optional(string()),
  stdout: optional(string()),
  stderr: optional(string()),
  aggregated_output: optional(string()),
  formatted_output: optional(string()),
  exit_code: optional(number()),
  status: optional(string()),
});

const bashLikeResultSchema = object({
  stdout: string(),
  stderr: string(),
  interrupted: optional(union([literal(true), literal(false)])),
});

const readArgsSchema = object({
  path: optional(string()),
  file_path: optional(string()),
});

const commandArgsSchema = object({
  command: union([string(), array(string())]),
  cwd: optional(string()),
  description: optional(string()),
});

const searchResultSchema = object({
  filenames: array(string()),
  durationMs: optional(number()),
  numFiles: optional(number()),
  truncated: optional(union([literal(true), literal(false)])),
});

const todoItemSchema = object({
  content: string(),
  status: union([literal('pending'), literal('in_progress'), literal('completed')]),
  priority: optional(union([literal('low'), literal('medium'), literal('high')])),
});

const todoArgsSchema = object({
  todos: array(todoItemSchema),
});

type DynamicToolInput = InferOutput<typeof dynamicToolInputSchema>;
type ExecResult = InferOutput<typeof execResultSchema>;
type BashLikeResult = InferOutput<typeof bashLikeResultSchema>;
type SearchResult = InferOutput<typeof searchResultSchema>;
type TodoItem = InferOutput<typeof todoItemSchema>;

type JsonParseResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

export type AcpToolVisualView =
  | {
      readonly kind: 'terminal';
      readonly command: string;
      readonly cwd: string | null;
      readonly stdout: string;
      readonly stderr: string;
      readonly exitCode: number | null;
      readonly status: string | null;
    }
  | {
      readonly kind: 'file-read';
      readonly path: string;
      readonly text: string;
    }
  | {
      readonly kind: 'search-results';
      readonly pattern: string | null;
      readonly filenames: readonly string[];
      readonly truncated: boolean;
      readonly durationMs: number | null;
      readonly numFiles: number | null;
    }
  | {
      readonly kind: 'todos';
      readonly todos: readonly TodoItem[];
    };

const parseJson = (text: string): JsonParseResult => {
  if (text.trim().length === 0) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

const parseCallInput = (
  call: Extract<RawEvent, { type: 'toolCall' }> | null,
): DynamicToolInput | null => {
  if (call === null) {
    return null;
  }

  const raw = parseJson(call.rawText);
  if (raw.ok) {
    const parsedRaw = safeParse(toolCallRawSchema, raw.value);
    if (parsedRaw.success) {
      return parsedRaw.output.input;
    }
  }

  const inputText = parseJson(call.inputText);
  if (inputText.ok) {
    const parsedInputText = safeParse(toolCallInputTextSchema, inputText.value);
    if (parsedInputText.success) {
      return parsedInputText.output;
    }
  }

  return null;
};

const parseResultPayload = (
  result: Extract<RawEvent, { type: 'toolResult' }> | null,
): { readonly input: DynamicToolInput | null; readonly output: unknown } | null => {
  if (result === null) {
    return null;
  }

  const raw = parseJson(result.rawText);
  if (raw.ok) {
    const parsedRaw = safeParse(toolResultRawSchema, raw.value);
    if (parsedRaw.success) {
      return { input: parsedRaw.output.input, output: parsedRaw.output.output };
    }
  }

  const parsedOutputText = parseJson(result.outputText);
  return { input: null, output: parsedOutputText.ok ? parsedOutputText.value : result.outputText };
};

const extractOutputText = (output: unknown): string | null => {
  if (typeof output === 'string') {
    return output;
  }

  const stringResult = safeParse(contentTextOutputSchema, output);
  if (stringResult.success) {
    return stringResult.output.content;
  }

  const arrayResult = safeParse(contentArrayOutputSchema, output);
  if (arrayResult.success) {
    const texts = arrayResult.output.content.flatMap((item) => {
      const parsedItem = safeParse(textContentSchema, item);
      return parsedItem.success ? [parsedItem.output.text] : [];
    });
    if (texts.length > 0) {
      return texts.join('\n');
    }
  }

  return null;
};

const commandToText = (command: readonly string[] | string): string => {
  if (typeof command === 'string') {
    return command;
  }
  return command.at(-1) ?? command.join(' ');
};

const visualTerminalFromResult = ({
  args,
  output,
}: {
  readonly args: unknown;
  readonly output: unknown;
}): Extract<AcpToolVisualView, { kind: 'terminal' }> | null => {
  const parsedExec = safeParse(execResultSchema, output);
  if (parsedExec.success) {
    const data: ExecResult = parsedExec.output;
    const command = data.command !== undefined ? commandToText(data.command) : null;
    const stdout = data.formatted_output ?? data.aggregated_output ?? data.stdout ?? '';
    if (command !== null || stdout.length > 0 || (data.stderr ?? '').length > 0) {
      return {
        kind: 'terminal',
        command: command ?? '',
        cwd: data.cwd ?? null,
        stdout,
        stderr: data.stderr ?? '',
        exitCode: data.exit_code ?? null,
        status: data.status ?? null,
      };
    }
  }

  const parsedArgs = safeParse(commandArgsSchema, args);
  if (parsedArgs.success) {
    const parsedBash = safeParse(bashLikeResultSchema, output);
    if (parsedBash.success) {
      const data: BashLikeResult = parsedBash.output;
      return {
        kind: 'terminal',
        command: commandToText(parsedArgs.output.command),
        cwd: parsedArgs.output.cwd ?? null,
        stdout: data.stdout,
        stderr: data.stderr,
        exitCode: null,
        status: data.interrupted === true ? 'interrupted' : null,
      };
    }

    return {
      kind: 'terminal',
      command: commandToText(parsedArgs.output.command),
      cwd: parsedArgs.output.cwd ?? null,
      stdout: extractOutputText(output) ?? '',
      stderr: '',
      exitCode: null,
      status: null,
    };
  }

  return null;
};

const visualFileRead = ({
  args,
  output,
}: {
  readonly args: unknown;
  readonly output: unknown;
}): Extract<AcpToolVisualView, { kind: 'file-read' }> | null => {
  const parsedArgs = safeParse(readArgsSchema, args);
  if (!parsedArgs.success) {
    return null;
  }

  const path = parsedArgs.output.path ?? parsedArgs.output.file_path ?? null;
  const text = extractOutputText(output);
  if (path === null || text === null) {
    return null;
  }

  return { kind: 'file-read', path, text };
};

const visualSearchResults = ({
  args,
  output,
}: {
  readonly args: unknown;
  readonly output: unknown;
}): Extract<AcpToolVisualView, { kind: 'search-results' }> | null => {
  const parsedSearch = safeParse(searchResultSchema, output);
  if (parsedSearch.success) {
    const data: SearchResult = parsedSearch.output;
    return {
      kind: 'search-results',
      pattern: null,
      filenames: data.filenames,
      truncated: data.truncated ?? false,
      durationMs: data.durationMs ?? null,
      numFiles: data.numFiles ?? null,
    };
  }

  const text = extractOutputText(output);
  if (text === null) {
    return null;
  }

  const patternSchema = object({
    pattern: string(),
  });
  const parsedPattern = safeParse(patternSchema, args);
  if (!parsedPattern.success) {
    return null;
  }

  const filenames = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return {
    kind: 'search-results',
    pattern: parsedPattern.output.pattern,
    filenames,
    truncated: text.includes('Results are truncated'),
    durationMs: null,
    numFiles: filenames.length,
  };
};

const visualTodos = (args: unknown): Extract<AcpToolVisualView, { kind: 'todos' }> | null => {
  const parsedArgs = safeParse(todoArgsSchema, args);
  if (!parsedArgs.success) {
    return null;
  }
  return { kind: 'todos', todos: parsedArgs.output.todos };
};

export const resolveAcpToolVisualView = (item: AcpToolMergeItem): AcpToolVisualView | null => {
  const callInput = parseCallInput(item.call);
  const resultPayload = parseResultPayload(item.result);
  const input = resultPayload?.input ?? callInput;
  if (input === null) {
    return null;
  }

  const output = resultPayload?.output;
  const toolName = input.toolName.trim().toLowerCase();

  if (toolName === 'todowrite') {
    return visualTodos(input.args);
  }

  const terminal = visualTerminalFromResult({ args: input.args, output });
  if (terminal !== null) {
    return terminal;
  }

  if (toolName === 'read' || toolName === 'read_file') {
    return visualFileRead({ args: input.args, output });
  }

  const search = visualSearchResults({ args: input.args, output });
  if (search !== null) {
    return search;
  }

  return null;
};
