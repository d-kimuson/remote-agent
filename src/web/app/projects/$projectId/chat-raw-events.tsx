import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Sparkles,
  SplitSquareVertical,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { type FC, type ReactNode } from "react";

import type { RawEvent } from "../../../../shared/acp.ts";
import { cn } from "../../../lib/utils.ts";

const MAX_TEXT_LEN = 16_000;

const truncate = (value: string): string =>
  value.length > MAX_TEXT_LEN ? `${value.slice(0, MAX_TEXT_LEN)}…` : value;

const MetaBlock: FC<{
  readonly icon: typeof Wrench;
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}> = ({ icon: Icon, title, children, className }) => {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-muted/30 text-xs leading-relaxed",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5 font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span>{title}</span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
};

export const ChatRawEvents: FC<{
  readonly events: readonly RawEvent[];
  readonly className?: string;
}> = ({ events, className }) => {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-3 space-y-2", className)}>
      {events.map((event, index) => {
        const key = `${event.type}-${index}`;

        if (event.type === "reasoning") {
          return (
            <MetaBlock
              className="border-violet-500/20 bg-violet-500/5"
              icon={Brain}
              key={key}
              title="思考 (thinking)"
            >
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {truncate(event.text)}
              </pre>
            </MetaBlock>
          );
        }

        if (event.type === "toolCall") {
          return (
            <MetaBlock icon={Wrench} key={key} title={`ツール呼び出し · ${event.toolName}`}>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {truncate(event.inputText.length > 0 ? event.inputText : "（空）")}
              </pre>
            </MetaBlock>
          );
        }

        if (event.type === "toolResult") {
          return (
            <MetaBlock
              className="border-emerald-500/15"
              icon={CheckCircle2}
              key={key}
              title={`ツール結果 · ${event.toolName}`}
            >
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {truncate(event.outputText)}
              </pre>
            </MetaBlock>
          );
        }

        if (event.type === "toolError") {
          return (
            <MetaBlock
              className="border-destructive/30 bg-destructive/5"
              icon={AlertCircle}
              key={key}
              title={`ツールエラー · ${event.toolName}`}
            >
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-destructive">
                {truncate(event.errorText)}
              </pre>
            </MetaBlock>
          );
        }

        if (event.type === "plan") {
          return (
            <MetaBlock icon={Sparkles} key={key} title="プラン (plan)">
              <ul className="list-inside list-disc space-y-1 text-[11px]">
                {event.entries.map((entry) => (
                  <li className="whitespace-pre-wrap" key={entry}>
                    {entry}
                  </li>
                ))}
              </ul>
            </MetaBlock>
          );
        }

        if (event.type === "diff") {
          return (
            <MetaBlock icon={SplitSquareVertical} key={key} title={`差分 · ${event.path}`}>
              <pre className="max-h-48 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                {truncate(
                  `--- old\n${event.oldText ?? ""}\n--- new\n${event.newText ?? ""}`.trimEnd(),
                )}
              </pre>
            </MetaBlock>
          );
        }

        if (event.type === "terminal") {
          return (
            <MetaBlock icon={TerminalSquare} key={key} title="ターミナル (terminal)">
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {truncate(event.text)}
              </pre>
            </MetaBlock>
          );
        }

        return null;
      })}
    </div>
  );
};
