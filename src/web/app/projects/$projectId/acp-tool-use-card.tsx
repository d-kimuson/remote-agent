import { AlertCircle, CheckCircle2, ChevronDown, Wrench } from "lucide-react";
import { useState, type FC } from "react";

import { Card, CardContent } from "../../../components/ui/card.tsx";
import { cn } from "../../../lib/utils.ts";
import type { AcpToolMergeItem } from "./acp-event-plan.pure.ts";
import { resolveAcpToolCardTitle } from "./acp-tool-display-title.pure.ts";
import { toolBlockClipboardText } from "./chat-block-copy.pure.ts";
import { CopyBlockButton } from "./copy-block-button.tsx";

const MAX_LEN = 32_000;
const take = (s: string) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s);

export const AcpToolUseCard: FC<{
  readonly item: AcpToolMergeItem;
  readonly className?: string;
}> = ({ item, className }) => {
  const { call, result, error } = item;
  if (call === null && result === null && error === null) {
    return null;
  }
  const title = resolveAcpToolCardTitle({ call, result, error });
  const [open, setOpen] = useState(false);
  const copyText = toolBlockClipboardText(item);

  return (
    <Card
      className={cn(
        "!gap-0 !py-0 mb-2.5 border border-blue-200/80 bg-blue-50/50 text-card-foreground ring-blue-200/30 dark:border-blue-800/60 dark:bg-blue-950/25 dark:ring-blue-900/30",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-blue-200/70 pr-2 dark:border-blue-800/50">
        <button
          aria-expanded={open}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-between gap-2 border-0 bg-transparent px-3 py-2.5 text-left font-inherit transition-colors hover:bg-blue-100/50 sm:px-3.5 dark:hover:bg-blue-900/20",
          )}
          onClick={() => {
            setOpen((o) => !o);
          }}
          type="button"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Wrench className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span
              className="min-w-0 truncate text-sm font-medium leading-snug text-foreground"
              title={title}
            >
              {title}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open ? "rotate-180" : "",
            )}
            aria-hidden
          />
        </button>
        <CopyBlockButton className="opacity-80 hover:opacity-100" text={copyText} />
      </div>
      {open ? (
        <CardContent className="space-y-3 border-0 py-3">
          {call !== null ? (
            <div>
              <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">入力 (args)</h4>
              <pre className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-background/80 p-2.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                {take(call.inputText.length > 0 ? call.inputText : "（空）")}
              </pre>
            </div>
          ) : null}
          {error !== null ? (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertCircle className="size-3" />
                エラー
              </h4>
              <pre className="max-h-48 overflow-y-auto rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-destructive">
                {take(error.errorText)}
              </pre>
            </div>
          ) : null}
          {result !== null ? (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                戻り値 (output)
              </h4>
              <pre className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-background/80 p-2.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                {take(result.outputText)}
              </pre>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
};
