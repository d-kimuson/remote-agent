import {
  array,
  literal,
  nullable,
  number,
  object,
  optional,
  pipe,
  record,
  safeParse,
  string,
  trim,
  union,
  unknown,
  type InferOutput,
} from 'valibot';

import type { RawEvent } from '../../../../shared/acp.ts';
import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

import {
  buildFileDiffFromStrings,
  buildFileDiffFromTextEdits,
  buildFileDiffFromUnifiedDiff,
  type FileDiff,
} from './diff-viewer.pure.ts';

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

const directToolCallRawSchema = object({
  toolName: pipe(string(), trim()),
  input: unknown(),
});

const toolCallInputTextSchema = object({
  toolName: pipe(string(), trim()),
  args: optional(unknown()),
});

const toolResultRawSchema = object({
  input: optional(dynamicToolInputSchema),
  output: unknown(),
});

const directToolResultRawSchema = object({
  toolName: pipe(string(), trim()),
  input: optional(dynamicToolInputSchema),
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

const execCommandArgsSchema = object({
  cmd: string(),
  workdir: optional(string()),
});

const editArgsSchema = object({
  file_path: string(),
  old_string: optional(string()),
  new_string: optional(string()),
});

const writeArgsSchema = object({
  file_path: optional(string()),
  path: optional(string()),
  content: string(),
});

const piTextEditSchema = object({
  oldText: string(),
  newText: string(),
});

const piEditArgsSchema = object({
  path: string(),
  edits: array(piTextEditSchema),
});

const outputDiffItemSchema = object({
  oldText: string(),
  newText: string(),
  path: string(),
  type: literal('diff'),
});

const outputDiffSchema = array(outputDiffItemSchema);

const fileChangeSchema = object({
  type: string(),
  unified_diff: string(),
  move_path: optional(nullable(string())),
});

const changesArgsSchema = object({
  changes: record(string(), fileChangeSchema),
});

const fileNameDiffSchema = object({
  fileName: string(),
  diff: string(),
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
      readonly pending?: true;
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
    }
  | {
      readonly kind: 'diff';
      readonly files: readonly FileDiff[];
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

    const parsedDirectRaw = safeParse(directToolCallRawSchema, raw.value);
    if (parsedDirectRaw.success) {
      return {
        toolName: parsedDirectRaw.output.toolName,
        args: parsedDirectRaw.output.input,
      };
    }
  }

  const inputText = parseJson(call.inputText);
  if (inputText.ok) {
    const parsedInputText = safeParse(toolCallInputTextSchema, inputText.value);
    if (parsedInputText.success) {
      return parsedInputText.output;
    }

    if (typeof inputText.value === 'string') {
      const command = stripInlineCode(inputText.value);
      if (command !== null) {
        return {
          toolName: call.toolName,
          args: { command },
        };
      }
    }

    return {
      toolName: call.toolName,
      args: inputText.value,
    };
  }

  const rawCommand = stripInlineCode(call.inputText);
  if (rawCommand !== null) {
    return {
      toolName: call.toolName,
      args: { command: rawCommand },
    };
  }

  return null;
};

const stripInlineCode = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2
    ? trimmed.slice(1, -1).trim()
    : trimmed;
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
      return { input: parsedRaw.output.input ?? null, output: parsedRaw.output.output };
    }

    const parsedDirectRaw = safeParse(directToolResultRawSchema, raw.value);
    if (parsedDirectRaw.success) {
      return {
        input: parsedDirectRaw.output.input ?? null,
        output: parsedDirectRaw.output.output,
      };
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

const extractOutputOrExecText = (output: unknown): string | null => {
  const text = extractOutputText(output);
  if (text !== null) {
    return text;
  }

  const parsedExec = safeParse(execResultSchema, output);
  if (parsedExec.success) {
    const data: ExecResult = parsedExec.output;
    return data.formatted_output ?? data.aggregated_output ?? data.stdout ?? null;
  }

  return null;
};

const commandToText = (command: readonly string[] | string): string => {
  if (typeof command === 'string') {
    return command;
  }
  return command.at(-1) ?? command.join(' ');
};

const execCommandOutputPattern =
  /^Command: (?<command>.+)\n(?:.*\n)*?Process exited with code (?<exitCode>-?\d+)\n(?:.*\n)*?Output:\n(?<stdout>[\s\S]*)$/;

const visualTerminalFromExecCommandOutput = (
  output: unknown,
): Extract<AcpToolVisualView, { kind: 'terminal' }> | null => {
  const text = extractOutputText(output);
  if (text === null) {
    return null;
  }

  const match = text.match(execCommandOutputPattern);
  const groups = match?.groups;
  if (groups === undefined) {
    return {
      kind: 'terminal',
      command: '',
      cwd: null,
      stdout: text,
      stderr: '',
      exitCode: null,
      status: null,
    };
  }

  const exitCodeText = groups['exitCode'];
  const exitCode = exitCodeText === undefined ? null : Number.parseInt(exitCodeText, 10);
  return {
    kind: 'terminal',
    command: groups['command'] ?? '',
    cwd: null,
    stdout: groups['stdout'] ?? '',
    stderr: '',
    exitCode: exitCode === null || Number.isNaN(exitCode) ? null : exitCode,
    status: null,
  };
};

const parsedReadLabel = (args: unknown): string | null => {
  const parsed = safeParse(
    object({
      parsed_cmd: array(
        object({
          type: string(),
          path: optional(string()),
        }),
      ),
    }),
    args,
  );
  if (!parsed.success) {
    return null;
  }

  const commands = parsed.output.parsed_cmd;
  const reads = commands.filter((cmd) => cmd.type === 'read');
  if (reads.length === 0 || reads.length !== commands.length) {
    return null;
  }

  const paths = reads.flatMap((cmd) => (cmd.path === undefined ? [] : [cmd.path]));
  return paths.length > 0 ? paths.join(', ') : null;
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
      ...(output === undefined ? { pending: true } : {}),
    };
  }

  const parsedExecCommandArgs = safeParse(execCommandArgsSchema, args);
  if (parsedExecCommandArgs.success) {
    const parsedOutput = visualTerminalFromExecCommandOutput(output);
    if (parsedOutput !== null) {
      return {
        ...parsedOutput,
        command: parsedExecCommandArgs.output.cmd,
        cwd: parsedExecCommandArgs.output.workdir ?? parsedOutput.cwd,
      };
    }

    return {
      kind: 'terminal',
      command: parsedExecCommandArgs.output.cmd,
      cwd: parsedExecCommandArgs.output.workdir ?? null,
      stdout: extractOutputText(output) ?? '',
      stderr: '',
      exitCode: null,
      status: null,
      ...(output === undefined ? { pending: true } : {}),
    };
  }

  return null;
};

const visualFileRead = ({
  args,
  output,
  pathFallback,
}: {
  readonly args: unknown;
  readonly output: unknown;
  readonly pathFallback: string | null;
}): Extract<AcpToolVisualView, { kind: 'file-read' }> | null => {
  const parsedArgs = safeParse(readArgsSchema, args);
  if (!parsedArgs.success) {
    const text = extractOutputText(output);
    return pathFallback === null || text === null
      ? null
      : { kind: 'file-read', path: pathFallback, text };
  }

  const path = parsedArgs.output.path ?? parsedArgs.output.file_path ?? pathFallback;
  const text = extractOutputText(output);
  if (path === null || text === null) {
    return null;
  }

  return { kind: 'file-read', path, text };
};

const visualFileFromParsedReadCommand = ({
  args,
  output,
}: {
  readonly args: unknown;
  readonly output: unknown;
}): Extract<AcpToolVisualView, { kind: 'file-read' }> | null => {
  const path = parsedReadLabel(args);
  const text = extractOutputOrExecText(output);
  if (path === null || text === null) {
    return null;
  }

  return { kind: 'file-read', path, text };
};

const visualFileWrite = (
  args: unknown,
): Extract<AcpToolVisualView, { kind: 'file-read' }> | null => {
  const parsedArgs = safeParse(writeArgsSchema, args);
  if (!parsedArgs.success) {
    return null;
  }

  const path = parsedArgs.output.path ?? parsedArgs.output.file_path ?? null;
  if (path === null) {
    return null;
  }

  return { kind: 'file-read', path, text: parsedArgs.output.content };
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

const visualDiff = (args: unknown): Extract<AcpToolVisualView, { kind: 'diff' }> | null => {
  const parsedFileNameDiff = safeParse(fileNameDiffSchema, args);
  if (parsedFileNameDiff.success) {
    return {
      kind: 'diff',
      files: [
        buildFileDiffFromUnifiedDiff({
          filename: parsedFileNameDiff.output.fileName,
          unifiedDiff: parsedFileNameDiff.output.diff,
          changeType: parsedFileNameDiff.output.diff.includes('\ncreate file mode ')
            ? 'create'
            : undefined,
        }),
      ],
    };
  }

  const parsedChangesArgs = safeParse(changesArgsSchema, args);
  if (parsedChangesArgs.success) {
    const files = Object.entries(parsedChangesArgs.output.changes).map(([filename, change]) =>
      buildFileDiffFromUnifiedDiff({
        filename: change.move_path ?? filename,
        oldFilename:
          change.move_path === null || change.move_path === undefined ? undefined : filename,
        unifiedDiff: change.unified_diff,
        changeType: change.type,
      }),
    );
    return files.length > 0 ? { kind: 'diff', files } : null;
  }

  const parsedEditArgs = safeParse(editArgsSchema, args);
  if (parsedEditArgs.success) {
    const oldString = parsedEditArgs.output.old_string;
    const newString = parsedEditArgs.output.new_string;
    if (oldString !== undefined && newString !== undefined) {
      return {
        kind: 'diff',
        files: [
          buildFileDiffFromStrings({
            filename: parsedEditArgs.output.file_path,
            oldString,
            newString,
          }),
        ],
      };
    }
  }

  const parsedPiEditArgs = safeParse(piEditArgsSchema, args);
  if (!parsedPiEditArgs.success) {
    return null;
  }

  return {
    kind: 'diff',
    files: [
      buildFileDiffFromTextEdits({
        filename: parsedPiEditArgs.output.path,
        edits: parsedPiEditArgs.output.edits,
      }),
    ],
  };
};

const visualDiffFromOutput = (
  output: unknown,
): Extract<AcpToolVisualView, { kind: 'diff' }> | null => {
  const parsedOutput = safeParse(outputDiffSchema, output);
  if (!parsedOutput.success) {
    return null;
  }

  const files = parsedOutput.output.map((diff) =>
    buildFileDiffFromStrings({
      filename: diff.path,
      oldString: diff.oldText,
      newString: diff.newText,
    }),
  );

  return files.length > 0 ? { kind: 'diff', files } : null;
};

const isReadToolName = (toolName: string): boolean =>
  toolName === 'read' ||
  toolName === 'read_file' ||
  toolName === 'read file' ||
  toolName === 'view' ||
  toolName === 'viewing' ||
  toolName.startsWith('view ') ||
  toolName.startsWith('viewing ') ||
  toolName.startsWith('read ');

export const resolveAcpToolVisualView = (item: AcpToolMergeItem): AcpToolVisualView | null => {
  const callInput = parseCallInput(item.call);
  const resultPayload = parseResultPayload(item.result);
  const input = resultPayload?.input ?? callInput;
  if (
    input === null &&
    item.result !== null &&
    item.result.toolName === 'exec_command' &&
    resultPayload !== null
  ) {
    return visualTerminalFromExecCommandOutput(resultPayload.output);
  }
  if (input === null) {
    return null;
  }

  const output = resultPayload?.output;
  const toolName = input.toolName.trim().toLowerCase();

  if (toolName === 'todowrite') {
    return visualTodos(input.args);
  }

  const outputDiff = visualDiffFromOutput(output);
  if (outputDiff !== null) {
    return outputDiff;
  }

  const diff = visualDiff(input.args);
  if (diff !== null) {
    return diff;
  }

  const write = visualFileWrite(input.args);
  if (write !== null) {
    return write;
  }

  const parsedReadCommandFile = visualFileFromParsedReadCommand({ args: input.args, output });
  if (parsedReadCommandFile !== null) {
    return parsedReadCommandFile;
  }

  const terminal = visualTerminalFromResult({ args: input.args, output });
  if (terminal !== null) {
    return terminal;
  }

  if (isReadToolName(toolName)) {
    return visualFileRead({ args: input.args, output, pathFallback: input.toolName });
  }

  const search = visualSearchResults({ args: input.args, output });
  if (search !== null) {
    return search;
  }

  return null;
};
