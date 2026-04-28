import { Bold, Code2, Italic, List, Quote, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "../../../components/ui/button.tsx";
import { cn } from "../../../lib/utils.ts";
import {
  applyRichPromptFormat,
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
  readonly toolbarTrailing?: ReactNode;
}> = ({
  className,
  disabled = false,
  externalValue,
  onSubmit,
  onValueReaderReady,
  placeholder,
  toolbarTrailing,
}) => {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(externalValue.value);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }

    valueRef.current = externalValue.value;
    if (editor.value !== externalValue.value) {
      editor.value = externalValue.value;
    }
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
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

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-transparent shadow-sm transition-colors focus-within:border-ring/45 focus-within:ring-3 focus-within:ring-ring/20",
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
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={editorRef}
          rows={3}
          spellCheck={false}
        />
      </div>
    </div>
  );
};
