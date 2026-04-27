import { Brain, Sparkles, SplitSquareVertical, TerminalSquare, Wrench } from "lucide-react";
import { type FC, type ReactNode } from "react";

import type { RawEvent } from "../../../../shared/acp.ts";
import { cn } from "../../../lib/utils.ts";
import { AcpToolUseCard } from "./acp-tool-use-card.tsx";
import { planRawEventsForRender } from "./acp-event-plan.pure.ts";
import { filterDisplayableRawEvents } from "./transcript-display.pure.ts";

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
        "rounded-lg border border-border/40 bg-muted/20 text-xs leading-relaxed",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border/35 px-2.5 py-1.5 font-medium text-muted-foreground/90">
        <Icon className="size-3.5 shrink-0" />
        <span>{title}</span>
      </div>
      <div className="px-2.5 py-2">{children}</div>
    </div>
  );
};

const AcpOneLooseEvent: FC<{ readonly event: RawEvent }> = ({ event }) => {
  if (event.type === "reasoning") {
    return (
      <MetaBlock
        className="border-violet-500/20 bg-violet-500/5"
        icon={Brain}
        title="思考 (thinking)"
      >
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
          {truncate(event.text)}
        </pre>
      </MetaBlock>
    );
  }

  if (event.type === "toolInput") {
    return (
      <MetaBlock icon={Wrench} title="ツール入力 (tool-input)">
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]">
          {truncate(event.text.length > 0 ? event.text : "（空）")}
        </pre>
      </MetaBlock>
    );
  }

  if (event.type === "streamPart") {
    return (
      <MetaBlock
        className="border-sky-500/20 bg-sky-500/5"
        icon={SplitSquareVertical}
        title={`ストリーム · ${event.partType}`}
      >
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
          {truncate(event.text)}
        </pre>
      </MetaBlock>
    );
  }

  if (event.type === "toolCall" || event.type === "toolResult" || event.type === "toolError") {
    return null;
  }

  if (event.type === "plan") {
    return (
      <MetaBlock icon={Sparkles} title="プラン (plan)">
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
      <MetaBlock icon={SplitSquareVertical} title={`差分 · ${event.path}`}>
        <pre className="max-h-48 overflow-y-auto font-mono text-[11px] text-muted-foreground">
          {truncate(`--- old\n${event.oldText ?? ""}\n--- new\n${event.newText ?? ""}`.trimEnd())}
        </pre>
      </MetaBlock>
    );
  }

  if (event.type === "terminal") {
    return (
      <MetaBlock icon={TerminalSquare} title="ターミナル (terminal)">
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]">
          {truncate(event.text)}
        </pre>
      </MetaBlock>
    );
  }

  return null;
};

export const ChatRawEvents: FC<{
  readonly events: readonly RawEvent[];
  readonly className?: string;
}> = ({ events, className }) => {
  const visible = filterDisplayableRawEvents(events);
  if (visible.length === 0) {
    return null;
  }
  const plan = planRawEventsForRender(visible);
  if (plan.length === 0) {
    return null;
  }

  return (
    <div className={cn("w-full space-y-2.5", className)}>
      {plan.map((item) => {
        if (item.type === "tool") {
          return <AcpToolUseCard item={item} key={item.key} />;
        }
        return <AcpOneLooseEvent event={item.event} key={item.key} />;
      })}
    </div>
  );
};
