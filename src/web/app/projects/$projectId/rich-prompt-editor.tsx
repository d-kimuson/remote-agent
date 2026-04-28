import { Bold, Code2, Italic, List, Quote, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { SlashCommand } from "../../../../shared/acp.ts";
import { Button } from "../../../components/ui/button.tsx";
import { cn } from "../../../lib/utils.ts";
import {
  applyRichPromptFormat,
  filterSlashCommands,
  replaceSlashCommandQuery,
  type RichPromptEditResult,
  type RichPromptFormat,
  type RichPromptSelection,
  slashCommandQueryFromPrompt,
} from "./rich-prompt-editor.pure.ts";

type ToolbarItem = {
  readonly format: RichPromptFormat;
  readonly label: string;
  readonly icon: LucideIcon;
};

const toolbarItems = [
  { format: "bold", label: "Bold", icon: Bold },
  { format: "italic", label: "Italic", icon: Italic },
  { format: "code", label: "Code", icon: Code2 },
  { format: "bulletList", label: "Bullet list", icon: List },
  { format: "quote", label: "Quote", icon: Quote },
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
  readonly slashCommands?: readonly SlashCommand[];
  readonly toolbarTrailing?: ReactNode;
}> = ({
  className,
  disabled = false,
  externalValue,
  onSubmit,
  onValueReaderReady,
  placeholder,
  slashCommands = [],
  toolbarTrailing,
}) => {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(externalValue.value);
  const [slashCommandQuery, setSlashCommandQuery] = useState<string | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const filteredSlashCommands = useMemo(
    () =>
      slashCommandQuery === null
        ? []
        : filterSlashCommands({ commands: slashCommands, query: slashCommandQuery }).slice(0, 8),
    [slashCommandQuery, slashCommands],
  );

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
    setSelectedCommandIndex(0);
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

  const refreshSlashCommandQuery = useCallback(() => {
    const editor = editorRef.current;
    const value = readCurrentValue();
    const selection =
      editor === null
        ? { start: value.length, end: value.length }
        : { start: editor.selectionStart, end: editor.selectionEnd };

    setSlashCommandQuery(slashCommandQueryFromPrompt({ value, selection }));
    setSelectedCommandIndex(0);
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

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    valueRef.current = event.currentTarget.value;
    refreshSlashCommandQuery();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (filteredSlashCommands.length > 0) {
      const isCommandNavigation = event.metaKey || event.ctrlKey;
      const isNextCommand = isCommandNavigation && event.key.toLowerCase() === "n";
      const isPreviousCommand = isCommandNavigation && event.key.toLowerCase() === "p";

      if (event.key === "Escape") {
        event.preventDefault();
        setSlashCommandQuery(null);
        setSelectedCommandIndex(0);
        return;
      }

      if (event.key === "ArrowDown" || isNextCommand) {
        event.preventDefault();
        setSelectedCommandIndex((current) => (current + 1) % filteredSlashCommands.length);
        return;
      }

      if (event.key === "ArrowUp" || isPreviousCommand) {
        event.preventDefault();
        setSelectedCommandIndex(
          (current) => (current + filteredSlashCommands.length - 1) % filteredSlashCommands.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const command = filteredSlashCommands[selectedCommandIndex] ?? filteredSlashCommands[0];
        if (command !== undefined) {
          insertSlashCommand(command);
        }
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit(readCurrentValue());
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      applyFormat("bold");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
      event.preventDefault();
      applyFormat("italic");
      return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isCommandNavigation =
      (event.metaKey || event.ctrlKey) && ["n", "p"].includes(event.key.toLowerCase());
    const isModifierKey = ["Alt", "Control", "Meta", "Shift"].includes(event.key);
    if (
      filteredSlashCommands.length > 0 &&
      (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key) ||
        isModifierKey ||
        isCommandNavigation)
    ) {
      return;
    }

    refreshSlashCommandQuery();
  };

  return (
    <div
      className={cn(
        "overflow-visible rounded-lg border border-input bg-transparent shadow-sm transition-colors focus-within:border-ring/45 focus-within:ring-3 focus-within:ring-ring/20",
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
            }, 100);
          }}
          onChange={handleChange}
          onClick={refreshSlashCommandQuery}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          placeholder={placeholder}
          ref={editorRef}
          rows={3}
          spellCheck={false}
        />
        {filteredSlashCommands.length === 0 ? null : (
          <div className="absolute right-2 bottom-full left-2 z-[60] mb-2 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
            {filteredSlashCommands.map((command, index) => (
              <button
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                  index === selectedCommandIndex ? "bg-accent text-accent-foreground" : "",
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
