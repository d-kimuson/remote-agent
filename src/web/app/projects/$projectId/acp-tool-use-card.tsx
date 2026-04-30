import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Code,
  FileText,
  ListChecks,
  Search,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import { useState, type FC } from 'react';

import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

import { Card, CardContent } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/utils.ts';
import { resolveAcpToolCardTitle } from './acp-tool-display-title.pure.ts';
import { resolveAcpToolVisualView, type AcpToolVisualView } from './acp-tool-visual-view.pure.ts';
import { toolBlockClipboardText } from './chat-block-copy.pure.ts';
import { CopyBlockButton } from './copy-block-button.tsx';
import { DiffViewer } from './diff-viewer.tsx';

const MAX_LEN = 32_000;
const take = (s: string) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s);

const SHORT_TEXT_LEN = 16_000;
const takeShort = (s: string) => (s.length > SHORT_TEXT_LEN ? `${s.slice(0, SHORT_TEXT_LEN)}…` : s);

const LineNumberedText: FC<{
  readonly text: string;
}> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <div className="max-h-96 overflow-auto bg-background/90 font-mono text-[11px] leading-relaxed">
      {lines.map((line, index) => (
        <div className="grid grid-cols-[3rem_minmax(0,1fr)]" key={`${index}-${line}`}>
          <span className="select-none border-r border-border/40 bg-muted/30 px-2 text-right text-muted-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words px-2">{line}</span>
        </div>
      ))}
    </div>
  );
};

const TerminalVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'terminal' }>;
}> = ({ visual }) => (
  <div className="overflow-hidden rounded-md border border-zinc-700/80 bg-zinc-950 text-zinc-100 shadow-sm">
    <div className="flex min-w-0 items-start gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[11px]">
      <span className="shrink-0 text-emerald-400">$</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {visual.command.length > 0 ? visual.command : '(command unavailable)'}
      </span>
      {visual.exitCode !== null ? (
        <span
          className={cn(
            'shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
            visual.exitCode === 0
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-red-500/40 text-red-300',
          )}
        >
          exit {visual.exitCode}
        </span>
      ) : null}
      {visual.status !== null ? (
        <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {visual.status}
        </span>
      ) : null}
    </div>
    {visual.stdout.length > 0 ? (
      <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-100">
        {takeShort(visual.stdout)}
      </pre>
    ) : null}
    {visual.stderr.length > 0 ? (
      <pre className="max-h-48 overflow-auto border-t border-red-500/25 bg-red-950/30 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-200">
        {takeShort(visual.stderr)}
      </pre>
    ) : null}
    {visual.stdout.length === 0 && visual.stderr.length === 0 && visual.pending !== true ? (
      <div className="px-3 py-2 text-[11px] text-zinc-500">出力なし</div>
    ) : null}
  </div>
);

const FileReadVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'file-read' }>;
}> = ({ visual }) => (
  <div className="overflow-hidden rounded-md border border-border/70 bg-background">
    <div className="flex min-w-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
      <FileText className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="min-w-0 truncate font-mono text-xs font-medium" title={visual.path}>
        {visual.path}
      </span>
    </div>
    <LineNumberedText text={takeShort(visual.text)} />
  </div>
);

const SearchResultsVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'search-results' }>;
}> = ({ visual }) => (
  <div className="overflow-hidden rounded-md border border-border/70 bg-background">
    <div className="flex min-w-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
      <Search className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="min-w-0 truncate text-xs font-medium">{visual.pattern ?? '検索結果'}</span>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
        {visual.numFiles ?? visual.filenames.length} files
      </span>
      {visual.truncated ? (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
          truncated
        </span>
      ) : null}
    </div>
    <div className="max-h-80 overflow-auto py-1">
      {visual.filenames.length > 0 ? (
        visual.filenames.map((filename) => (
          <div
            className="flex min-w-0 items-center gap-2 px-3 py-1 font-mono text-[11px]"
            key={filename}
          >
            <FileText className="size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate" title={filename}>
              {filename}
            </span>
          </div>
        ))
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">一致なし</div>
      )}
    </div>
    {visual.durationMs !== null ? (
      <div className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground">
        {visual.durationMs}ms
      </div>
    ) : null}
  </div>
);

const TodoStatusIcon: FC<{
  readonly status: Extract<AcpToolVisualView, { kind: 'todos' }>['todos'][number]['status'];
}> = ({ status }) => {
  if (status === 'completed') {
    return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === 'in_progress') {
    return <CircleDot className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground" />;
};

const TodosVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'todos' }>;
}> = ({ visual }) => {
  const completed = visual.todos.filter((todo) => todo.status === 'completed').length;
  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
        <ListChecks className="size-3.5 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-medium">Tasks</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {completed}/{visual.todos.length}
        </span>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto p-2">
        {visual.todos.map((todo) => (
          <div
            className={cn(
              'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs',
              todo.status === 'in_progress' ? 'bg-amber-500/10' : '',
              todo.status === 'completed' ? 'text-muted-foreground' : '',
            )}
            key={`${todo.content}-${todo.status}`}
          >
            <TodoStatusIcon status={todo.status} />
            <span
              className={cn('min-w-0 flex-1', todo.status === 'completed' ? 'line-through' : '')}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DiffVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'diff' }>;
}> = ({ visual }) => (
  <div className="space-y-2">
    {visual.files.map((file) => (
      <DiffViewer fileDiff={file} key={file.filename} />
    ))}
  </div>
);

export const AcpToolVisualViewBlock: FC<{
  readonly visual: AcpToolVisualView;
}> = ({ visual }) => {
  if (visual.kind === 'terminal') {
    return <TerminalVisual visual={visual} />;
  }
  if (visual.kind === 'file-read') {
    return <FileReadVisual visual={visual} />;
  }
  if (visual.kind === 'search-results') {
    return <SearchResultsVisual visual={visual} />;
  }
  if (visual.kind === 'diff') {
    return <DiffVisual visual={visual} />;
  }
  return <TodosVisual visual={visual} />;
};

export const AcpToolUseCard: FC<{
  readonly item: AcpToolMergeItem;
  readonly className?: string;
}> = ({ item, className }) => {
  const { call, result, error } = item;
  if (call === null && result === null && error === null) {
    return null;
  }
  const title = resolveAcpToolCardTitle({ call, result, error });
  const copyText = toolBlockClipboardText(item);
  const visual = resolveAcpToolVisualView(item);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>(visual !== null ? 'visual' : 'raw');
  const effectiveViewMode = visual === null ? 'raw' : viewMode;

  return (
    <Card
      size="sm"
      className={cn(
        '!gap-0 !py-0 rounded-lg border border-blue-200/80 bg-blue-50/50 text-card-foreground ring-blue-200/30 dark:border-blue-800/60 dark:bg-blue-950/25 dark:ring-blue-900/30',
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-blue-200/70 px-1 py-0.5 dark:border-blue-800/50">
        <button
          aria-expanded={open}
          className={cn(
            'inline-flex min-w-0 flex-1 items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left font-inherit transition-colors hover:bg-blue-100/50 dark:hover:bg-blue-900/20',
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
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <CopyBlockButton className="opacity-80 hover:opacity-100" text={copyText} />
          <button
            aria-label={open ? 'ツール詳細を閉じる' : 'ツール詳細を開く'}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-blue-100/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-blue-900/20"
            onClick={() => {
              setOpen((o) => !o);
            }}
            type="button"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', open ? 'rotate-180' : '')}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {open ? (
        <CardContent className="space-y-2 border-0 px-2.5 py-2 sm:px-3">
          {visual !== null ? (
            <div className="flex items-center gap-2">
              <h4 className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium text-muted-foreground">
                {effectiveViewMode === 'visual' ? (
                  <TerminalSquare className="size-3 shrink-0" />
                ) : (
                  <Code className="size-3 shrink-0" />
                )}
                <span>{effectiveViewMode === 'visual' ? '表示 (visual)' : 'Raw'}</span>
              </h4>
              <button
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                  effectiveViewMode === 'raw'
                    ? 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                onClick={() => {
                  setViewMode((mode) => (mode === 'raw' ? 'visual' : 'raw'));
                }}
                type="button"
              >
                <Code className="size-3" />
                Raw
              </button>
            </div>
          ) : null}
          {effectiveViewMode === 'visual' && visual !== null ? (
            <AcpToolVisualViewBlock visual={visual} />
          ) : null}
          {effectiveViewMode === 'raw' ? (
            <>
              {call !== null ? (
                <div>
                  <h4 className="mb-1 text-xs font-medium text-muted-foreground">入力 (args)</h4>
                  <pre className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-background/80 p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                    {take(call.inputText.length > 0 ? call.inputText : '（空）')}
                  </pre>
                </div>
              ) : null}
              {error !== null ? (
                <div>
                  <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertCircle className="size-3" />
                    エラー
                  </h4>
                  <pre className="max-h-48 overflow-y-auto rounded-md border border-destructive/25 bg-destructive/5 p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-destructive">
                    {take(error.errorText)}
                  </pre>
                </div>
              ) : null}
              {result !== null ? (
                <div>
                  <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                    戻り値 (output)
                  </h4>
                  <pre className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-background/80 p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                    {take(result.outputText)}
                  </pre>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
};
