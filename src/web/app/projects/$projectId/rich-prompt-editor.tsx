import { useQueryClient } from '@tanstack/react-query';
import {
  Bold,
  Check,
  Code2,
  File,
  Folder,
  Italic,
  List,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { FileCompletionEntry, SlashCommand } from '../../../../shared/acp.ts';

import { Button } from '../../../components/ui/button.tsx';
import { fetchFileCompletion } from '../../../lib/api/acp.ts';
import { cn } from '../../../lib/utils.ts';
import { fileCompletionQueryKey } from './queries.ts';
import {
  applyRichPromptFormat,
  fileCompletionQueryFromPrompt,
  filterSlashCommands,
  replaceFileCompletionQuery,
  replaceSlashCommandQuery,
  richPromptFormatShortcutFromInput,
  type RichPromptEditResult,
  type FileCompletionQuery,
  type RichPromptFormat,
  type RichPromptSelection,
  slashCommandQueryFromPrompt,
} from './rich-prompt-editor.pure.ts';

type ToolbarItem = {
  readonly format: RichPromptFormat;
  readonly label: string;
  readonly icon: LucideIcon;
};

const toolbarItems = [
  { format: 'bold', label: 'Bold', icon: Bold },
  { format: 'italic', label: 'Italic', icon: Italic },
  { format: 'code', label: 'Code', icon: Code2 },
  { format: 'bulletList', label: 'Bullet list', icon: List },
  { format: 'quote', label: 'Quote', icon: Quote },
] satisfies readonly ToolbarItem[];

export const RichPromptEditor: FC<{
  readonly className?: string;
  readonly disabled?: boolean;
  readonly externalValue: {
    readonly revision: number;
    readonly value: string;
  };
  readonly onSubmit: (value: string) => void;
  readonly onValueReaderReady: (readValue: () => string) => void;
  readonly placeholder: string;
  readonly projectId?: string;
  readonly slashCommands?: readonly SlashCommand[];
  readonly toolbarTrailing?: ReactNode;
}> = ({
  className,
  disabled = false,
  externalValue,
  onSubmit,
  onValueReaderReady,
  placeholder,
  projectId,
  slashCommands = [],
  toolbarTrailing,
}) => {
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileCompletionListRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(externalValue.value);
  const [slashCommandQuery, setSlashCommandQuery] = useState<string | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [fileCompletionQuery, setFileCompletionQuery] = useState<FileCompletionQuery | null>(null);
  const [fileCompletionData, setFileCompletionData] = useState<{
    readonly basePath: string;
    readonly entries: readonly FileCompletionEntry[];
  } | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const filteredSlashCommands = useMemo(
    () =>
      slashCommandQuery === null
        ? []
        : filterSlashCommands({ commands: slashCommands, query: slashCommandQuery }).slice(0, 8),
    [slashCommandQuery, slashCommands],
  );

  useEffect(() => {
    if (projectId === undefined || fileCompletionQuery === null) {
      setFileCompletionData(null);
      return;
    }

    let ignore = false;
    const basePath = fileCompletionQuery.basePath;
    void queryClient
      .fetchQuery({
        queryKey: fileCompletionQueryKey(projectId, basePath),
        queryFn: () => fetchFileCompletion({ projectId, basePath }),
        staleTime: 1000 * 60 * 5,
      })
      .then((data) => {
        if (!ignore) {
          setFileCompletionData({ basePath, entries: data.entries });
        }
      })
      .catch(() => {
        if (!ignore) {
          setFileCompletionData({ basePath, entries: [] });
        }
      });

    return () => {
      ignore = true;
    };
  }, [fileCompletionQuery, projectId, queryClient]);

  const filteredFileEntries = useMemo(() => {
    if (
      fileCompletionQuery === null ||
      fileCompletionData === null ||
      fileCompletionData.basePath !== fileCompletionQuery.basePath
    ) {
      return [];
    }

    const normalizedFilter = fileCompletionQuery.filterTerm.toLowerCase();
    return normalizedFilter.length === 0
      ? fileCompletionData.entries
      : fileCompletionData.entries.filter((entry) =>
          entry.name.toLowerCase().includes(normalizedFilter),
        );
  }, [fileCompletionData, fileCompletionQuery]);

  useLayoutEffect(() => {
    if (filteredFileEntries.length === 0) {
      return;
    }

    const list = fileCompletionListRef.current;
    const selected = list?.querySelector('[aria-selected="true"]');
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [filteredFileEntries, selectedFileIndex]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }

    valueRef.current = externalValue.value;
    if (editor.value !== externalValue.value) {
      editor.value = externalValue.value;
    }
    setSlashCommandQuery(null);
    setSelectedCommandIndex(0);
    setFileCompletionQuery(null);
    setFileCompletionData(null);
    setSelectedFileIndex(0);
  }, [externalValue]);

  const applyEditResult = useCallback((result: RichPromptEditResult) => {
    const editor = editorRef.current;
    if (editor === null) {
      valueRef.current = result.value;
      return;
    }

    editor.value = result.value;
    valueRef.current = result.value;
    editor.focus();
    editor.setSelectionRange(result.selection.start, result.selection.end);
    setSlashCommandQuery(slashCommandQueryFromPrompt(result));
    setFileCompletionQuery(fileCompletionQueryFromPrompt(result));
    setSelectedCommandIndex(0);
    setSelectedFileIndex(0);
  }, []);

  const readCurrentValue = useCallback((): string => {
    const editor = editorRef.current;
    return editor?.value ?? valueRef.current;
  }, []);

  useLayoutEffect(() => {
    onValueReaderReady(readCurrentValue);
  }, [onValueReaderReady, readCurrentValue]);

  const readCurrentSelection = useCallback((): RichPromptSelection => {
    const editor = editorRef.current;
    const currentValue = readCurrentValue();
    if (editor === null) {
      return { start: currentValue.length, end: currentValue.length };
    }

    return {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    };
  }, [readCurrentValue]);

  const refreshCompletionQueries = useCallback(() => {
    const editor = editorRef.current;
    const value = readCurrentValue();
    const selection =
      editor === null
        ? { start: value.length, end: value.length }
        : { start: editor.selectionStart, end: editor.selectionEnd };

    setSlashCommandQuery(slashCommandQueryFromPrompt({ value, selection }));
    setFileCompletionQuery(fileCompletionQueryFromPrompt({ value, selection }));
    setSelectedCommandIndex(0);
    setSelectedFileIndex(0);
  }, [readCurrentValue]);

  const applyFormat = useCallback(
    (format: RichPromptFormat) => {
      applyEditResult(
        applyRichPromptFormat({
          value: readCurrentValue(),
          selection: readCurrentSelection(),
          format,
        }),
      );
    },
    [applyEditResult, readCurrentSelection, readCurrentValue],
  );

  const insertSlashCommand = useCallback(
    (command: SlashCommand) => {
      applyEditResult(
        replaceSlashCommandQuery({
          value: readCurrentValue(),
          selection: readCurrentSelection(),
          commandName: command.name,
        }),
      );
    },
    [applyEditResult, readCurrentSelection, readCurrentValue],
  );

  const insertFileCompletion = useCallback(
    (entry: FileCompletionEntry, close: boolean) => {
      applyEditResult(
        replaceFileCompletionQuery({
          value: readCurrentValue(),
          selection: readCurrentSelection(),
          entry,
          close,
        }),
      );
    },
    [applyEditResult, readCurrentSelection, readCurrentValue],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    valueRef.current = event.currentTarget.value;
    refreshCompletionQueries();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (filteredFileEntries.length > 0) {
      const isCommandNavigation = event.metaKey || event.ctrlKey;
      const isNextCommand = isCommandNavigation && event.key.toLowerCase() === 'n';
      const isPreviousCommand = isCommandNavigation && event.key.toLowerCase() === 'p';

      if (event.key === 'Escape') {
        event.preventDefault();
        setFileCompletionQuery(null);
        setSelectedFileIndex(0);
        return;
      }

      if (event.key === 'ArrowDown' || isNextCommand) {
        event.preventDefault();
        setSelectedFileIndex((current) => (current + 1) % filteredFileEntries.length);
        return;
      }

      if (event.key === 'ArrowUp' || isPreviousCommand) {
        event.preventDefault();
        setSelectedFileIndex(
          (current) => (current + filteredFileEntries.length - 1) % filteredFileEntries.length,
        );
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const entry = filteredFileEntries[selectedFileIndex] ?? filteredFileEntries[0];
        if (entry !== undefined) {
          insertFileCompletion(entry, event.key === 'Enter' || entry.type === 'file');
        }
        return;
      }
    }

    if (filteredSlashCommands.length > 0) {
      const isCommandNavigation = event.metaKey || event.ctrlKey;
      const isNextCommand = isCommandNavigation && event.key.toLowerCase() === 'n';
      const isPreviousCommand = isCommandNavigation && event.key.toLowerCase() === 'p';

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashCommandQuery(null);
        setSelectedCommandIndex(0);
        return;
      }

      if (event.key === 'ArrowDown' || isNextCommand) {
        event.preventDefault();
        setSelectedCommandIndex((current) => (current + 1) % filteredSlashCommands.length);
        return;
      }

      if (event.key === 'ArrowUp' || isPreviousCommand) {
        event.preventDefault();
        setSelectedCommandIndex(
          (current) => (current + filteredSlashCommands.length - 1) % filteredSlashCommands.length,
        );
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const command = filteredSlashCommands[selectedCommandIndex] ?? filteredSlashCommands[0];
        if (command !== undefined) {
          insertSlashCommand(command);
        }
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onSubmit(readCurrentValue());
      return;
    }

    const formatShortcut = richPromptFormatShortcutFromInput({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (formatShortcut !== null) {
      event.preventDefault();
      applyFormat(formatShortcut);
      return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isCommandNavigation =
      (event.metaKey || event.ctrlKey) && ['n', 'p'].includes(event.key.toLowerCase());
    const isModifierKey = ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key);
    if (
      (filteredSlashCommands.length > 0 || filteredFileEntries.length > 0) &&
      (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key) ||
        isModifierKey ||
        isCommandNavigation)
    ) {
      return;
    }

    refreshCompletionQueries();
  };

  return (
    <div
      className={cn(
        'overflow-visible rounded-lg border border-input bg-transparent shadow-sm transition-colors focus-within:border-ring/45 focus-within:ring-3 focus-within:ring-ring/20',
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b bg-transparent px-2 py-1">
        {toolbarItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              aria-label={item.label}
              disabled={disabled}
              key={item.format}
              onClick={() => {
                applyFormat(item.format);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              size="icon-sm"
              title={item.label}
              type="button"
              variant="ghost"
            >
              <Icon className="size-4" />
            </Button>
          );
        })}
        {toolbarTrailing === undefined ? null : (
          <div className="ml-auto flex shrink-0 items-center gap-1">{toolbarTrailing}</div>
        )}
      </div>
      <div className="relative">
        <textarea
          aria-label={placeholder}
          className="block min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none selection:bg-primary/20 sm:min-h-20 sm:px-4 sm:py-3 sm:leading-7"
          defaultValue={externalValue.value}
          disabled={disabled}
          autoCapitalize="off"
          autoCorrect="off"
          onBlur={() => {
            window.setTimeout(() => {
              setSlashCommandQuery(null);
              setFileCompletionQuery(null);
            }, 100);
          }}
          onChange={handleChange}
          onClick={refreshCompletionQueries}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          placeholder={placeholder}
          ref={editorRef}
          rows={3}
          spellCheck={false}
        />
        {filteredFileEntries.length === 0 ? null : (
          <div
            className="absolute right-2 bottom-full left-2 z-[60] mb-2 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
            ref={fileCompletionListRef}
            role="listbox"
          >
            <div className="flex items-center gap-2 border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
              <File className="size-3.5" />
              <span>Files & Directories</span>
              {fileCompletionQuery?.basePath === undefined ||
              fileCompletionQuery.basePath.length === 0 ? null : (
                <span className="min-w-0 truncate font-mono">
                  in {fileCompletionQuery.basePath}
                </span>
              )}
            </div>
            {filteredFileEntries.map((entry, index) => {
              const Icon = entry.type === 'directory' ? Folder : File;
              return (
                <button
                  aria-selected={index === selectedFileIndex}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left font-mono text-sm transition-colors',
                    index === selectedFileIndex ? 'bg-accent text-accent-foreground' : '',
                  )}
                  key={entry.path}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onMouseEnter={() => {
                    setSelectedFileIndex(index);
                  }}
                  onClick={() => {
                    insertFileCompletion(entry, entry.type === 'file');
                  }}
                  role="option"
                  title={entry.path}
                  type="button"
                >
                  <Icon
                    className={cn(
                      'size-4 shrink-0',
                      entry.type === 'directory' ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {entry.name}
                    {entry.type === 'directory' ? '/' : ''}
                  </span>
                  {index === selectedFileIndex ? (
                    <Check className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {filteredSlashCommands.length === 0 ? null : (
          <div className="absolute right-2 bottom-full left-2 z-[60] mb-2 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
            {filteredSlashCommands.map((command, index) => (
              <button
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                  index === selectedCommandIndex ? 'bg-accent text-accent-foreground' : '',
                )}
                key={command.name}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  insertSlashCommand(command);
                }}
                type="button"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  /{command.name}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{command.description}</span>
                  {command.inputHint === null || command.inputHint === undefined ? null : (
                    <span className="block truncate text-xs text-muted-foreground">
                      {command.inputHint}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
