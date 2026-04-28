import { Bold, Code2, Italic, List, Quote, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FC,
  type KeyboardEvent,
} from "react";

import { Button } from "../../../components/ui/button.tsx";
import { cn } from "../../../lib/utils.ts";
import {
  applyRichPromptFormat,
  replaceRichPromptSelection,
  type RichPromptEditResult,
  type RichPromptFormat,
  type RichPromptSelection,
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

const readSelectionOffsets = (root: HTMLElement): RichPromptSelection | null => {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
};

const resolveTextPosition = (
  root: HTMLElement,
  targetOffset: number,
): { readonly node: Node; readonly offset: number } => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = targetOffset;
  let current = walker.nextNode();

  while (current !== null) {
    const length = current.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node: current, offset: remaining };
    }

    remaining -= length;
    current = walker.nextNode();
  }

  const text = document.createTextNode("");
  root.appendChild(text);
  return { node: text, offset: 0 };
};

const setSelectionOffsets = (root: HTMLElement, selection: RichPromptSelection): void => {
  const browserSelection = window.getSelection();
  if (browserSelection === null) {
    return;
  }

  const range = document.createRange();
  const start = resolveTextPosition(root, selection.start);
  const end = resolveTextPosition(root, selection.end);
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
};

export const RichPromptEditor: FC<{
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly value: string;
}> = ({ className, disabled = false, onChange, onSubmit, placeholder, value }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }

    if ((editor.textContent ?? "") !== value) {
      editor.textContent = value;
    }
  }, [value]);

  const applyEditResult = useCallback(
    (result: RichPromptEditResult) => {
      const editor = editorRef.current;
      if (editor === null) {
        onChange(result.value);
        return;
      }

      editor.textContent = result.value;
      onChange(result.value);
      editor.focus();
      setSelectionOffsets(editor, result.selection);
    },
    [onChange],
  );

  const readCurrentValue = useCallback((): string => {
    const editor = editorRef.current;
    return editor?.textContent ?? value;
  }, [value]);

  const readCurrentSelection = useCallback((): RichPromptSelection => {
    const editor = editorRef.current;
    const currentValue = readCurrentValue();
    if (editor === null) {
      return { start: currentValue.length, end: currentValue.length };
    }

    return readSelectionOffsets(editor) ?? { start: currentValue.length, end: currentValue.length };
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

  const replaceSelection = useCallback(
    (replacement: string) => {
      applyEditResult(
        replaceRichPromptSelection({
          value: readCurrentValue(),
          selection: readCurrentSelection(),
          replacement,
        }),
      );
    },
    [applyEditResult, readCurrentSelection, readCurrentValue],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
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

    if (event.key === "Enter") {
      event.preventDefault();
      replaceSelection("\n");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    replaceSelection(event.clipboardData.getData("text/plain"));
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card shadow-sm transition-colors focus-within:border-ring/45 focus-within:ring-3 focus-within:ring-ring/20",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b bg-muted/25 px-2 py-1.5">
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
      </div>
      <div className="relative">
        {value.length === 0 ? (
          <div className="pointer-events-none absolute top-4 left-4 select-none text-sm text-muted-foreground">
            {placeholder}
          </div>
        ) : null}
        <div
          aria-label={placeholder}
          aria-disabled={disabled}
          aria-multiline
          className="min-h-32 w-full whitespace-pre-wrap break-words bg-[color-mix(in_oklab,var(--background)_82%,var(--card))] px-4 py-4 text-sm leading-7 outline-none selection:bg-primary/20 empty:before:text-muted-foreground"
          contentEditable={!disabled}
          onInput={(event) => {
            onChange(event.currentTarget.textContent ?? "");
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
};
