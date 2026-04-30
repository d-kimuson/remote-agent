import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Code,
  FileText,
  ListChecks,
  Search,
  Wrench,
} from 'lucide-react';
import { useState, type FC } from 'react';

import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent } from '../../../components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog.tsx';
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

type ToolDetailSection = {
  readonly title: string;
  readonly text: string;
  readonly language?: string;
};

const extensionLanguageEntries = [
  { suffix: '.ts', language: 'typescript' },
  { suffix: '.tsx', language: 'typescript' },
  { suffix: '.js', language: 'javascript' },
  { suffix: '.jsx', language: 'javascript' },
  { suffix: '.json', language: 'json' },
  { suffix: '.md', language: 'markdown' },
  { suffix: '.css', language: 'css' },
  { suffix: '.html', language: 'html' },
  { suffix: '.yml', language: 'yaml' },
  { suffix: '.yaml', language: 'yaml' },
] as const;

const languageFromPath = (path: string): string | null => {
  const lower = path.toLowerCase();
  return extensionLanguageEntries.find((entry) => lower.endsWith(entry.suffix))?.language ?? null;
};

const formatJsonLike = (text: string): { readonly text: string; readonly language: string } => {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), language: 'json' };
  } catch {
    return { text, language: 'text' };
  }
};

const splitJsonLine = (line: string): readonly string[] =>
  line.split(/("(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?|[{}[\]:,])/g);

const splitCodeLine = (line: string): readonly string[] =>
  line.split(
    /(\b(?:const|let|var|readonly|type|interface|import|export|from|return|if|else|switch|case|for|while|function|class|extends|async|await|null|undefined|true|false)\b|\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|-?\d+(?:\.\d+)?)/g,
  );

const tokenClassName = (token: string, language: string): string => {
  if (token.length === 0) {
    return '';
  }
  if (language === 'json') {
    if (token.startsWith('"')) {
      return token.endsWith('":')
        ? 'text-sky-700 dark:text-sky-300'
        : 'text-emerald-700 dark:text-emerald-300';
    }
    if (/^(true|false|null)$/.test(token) || /^-?\d/.test(token)) {
      return 'text-purple-700 dark:text-purple-300';
    }
    if (/^[{}[\]:,]$/.test(token)) {
      return 'text-muted-foreground';
    }
    return '';
  }
  if (token.startsWith('//')) {
    return 'text-muted-foreground';
  }
  if (/^["'`]/.test(token)) {
    return 'text-emerald-700 dark:text-emerald-300';
  }
  if (/^(true|false|null|undefined)$/.test(token) || /^-?\d/.test(token)) {
    return 'text-purple-700 dark:text-purple-300';
  }
  if (/^[A-Za-z_]/.test(token)) {
    return 'text-blue-700 dark:text-blue-300';
  }
  return '';
};

const HighlightedCodeLine: FC<{
  readonly line: string;
  readonly language: string | null;
}> = ({ line, language }) => {
  if (language === null || language === 'text' || language === 'markdown') {
    return <>{line}</>;
  }
  const tokens = language === 'json' ? splitJsonLine(line) : splitCodeLine(line);
  return (
    <>
      {tokens.map((token, index) => (
        <span className={tokenClassName(token, language)} key={`${index}-${token}`}>
          {token}
        </span>
      ))}
    </>
  );
};

const HighlightedPre: FC<{
  readonly text: string;
  readonly language?: string | null;
  readonly className?: string;
}> = ({ text, language = null, className }) => {
  const lines = text.split('\n');
  return (
    <pre
      className={cn(
        'overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words',
        className,
      )}
    >
      {lines.map((line, index) => (
        <span key={`${index}-${line}`}>
          <HighlightedCodeLine language={language} line={line} />
          {index < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </pre>
  );
};

const ToolDetailButton: FC<{
  readonly detailText?: string;
  readonly sections?: readonly ToolDetailSection[];
}> = ({ detailText, sections }) => {
  const detailSections =
    sections ?? (detailText === undefined ? [] : [{ title: 'Detail', text: detailText }]);
  if (detailSections.every((section) => section.text.trim().length === 0)) {
    return null;
  }
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            size="icon"
            title="詳細を表示"
            type="button"
            variant="ghost"
          >
            <Code className="size-3.5" />
            <span className="sr-only">詳細を表示</span>
          </Button>
        }
      />
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tool detail</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65dvh] space-y-3 overflow-auto pr-1">
          {detailSections.map((section) => {
            const formatted = formatJsonLike(section.text);
            return (
              <section className="space-y-1.5" key={section.title}>
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
                    {section.title}
                  </h3>
                  <CopyBlockButton className="size-6" text={section.text} />
                </div>
                <HighlightedPre
                  className="max-h-80"
                  language={section.language ?? formatted.language}
                  text={take(formatted.text)}
                />
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LineNumberedText: FC<{
  readonly text: string;
  readonly language?: string | null;
}> = ({ text, language = null }) => {
  const lines = text.split('\n');
  return (
    <div className="max-h-96 overflow-auto bg-background/90 font-mono text-[11px] leading-relaxed">
      {lines.map((line, index) => (
        <div className="grid grid-cols-[3rem_minmax(0,1fr)]" key={`${index}-${line}`}>
          <span className="select-none border-r border-border/40 bg-muted/30 px-2 text-right text-muted-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words px-2">
            <HighlightedCodeLine language={language} line={line} />
          </span>
        </div>
      ))}
    </div>
  );
};

const TerminalVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'terminal' }>;
  readonly copyText?: string;
  readonly detailText?: string;
  readonly detailSections?: readonly ToolDetailSection[];
}> = ({ visual, copyText, detailText, detailSections }) => {
  const [open, setOpen] = useState(false);
  const hasOutput = visual.stdout.length > 0 || visual.stderr.length > 0;
  const toggleOutput = () => {
    setOpen((value) => !value);
  };
  return (
    <div className="overflow-hidden rounded-md border border-zinc-700/80 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="flex min-w-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px]">
        {hasOutput ? (
          <button
            aria-expanded={open}
            aria-label={open ? '出力を閉じる' : '出力を開く'}
            className="-my-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none"
            onClick={toggleOutput}
            type="button"
          >
            <ChevronDown className={cn('size-4 transition-transform', open ? 'rotate-180' : '')} />
          </button>
        ) : null}
        {hasOutput ? (
          <button
            aria-expanded={open}
            className="inline-flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none"
            onClick={toggleOutput}
            type="button"
          >
            <span className="shrink-0 text-emerald-400">$</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {visual.command.length > 0 ? visual.command : '(command unavailable)'}
            </span>
          </button>
        ) : (
          <div className="inline-flex min-w-0 flex-1 items-start gap-2 px-1 py-0.5">
            <span className="shrink-0 text-emerald-400">$</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {visual.command.length > 0 ? visual.command : '(command unavailable)'}
            </span>
          </div>
        )}
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
        {copyText !== undefined ? (
          <CopyBlockButton
            className="-my-1 size-6 text-zinc-400 hover:text-zinc-100"
            text={copyText}
          />
        ) : null}
        <ToolDetailButton detailText={detailText} sections={detailSections} />
      </div>
      {open && visual.stdout.length > 0 ? (
        <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-100">
          {takeShort(visual.stdout)}
        </pre>
      ) : null}
      {open && visual.stderr.length > 0 ? (
        <pre className="max-h-48 overflow-auto border-t border-red-500/25 bg-red-950/30 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-200">
          {takeShort(visual.stderr)}
        </pre>
      ) : null}
      {open && !hasOutput && visual.pending !== true ? (
        <div className="px-3 py-2 text-[11px] text-zinc-500">出力なし</div>
      ) : null}
    </div>
  );
};

const FileReadVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'file-read' }>;
  readonly title?: string;
  readonly copyText?: string;
  readonly defaultOpen?: boolean;
  readonly detailText?: string;
  readonly detailSections?: readonly ToolDetailSection[];
}> = ({ visual, title, copyText, defaultOpen, detailText, detailSections }) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const displayTitle = title ?? visual.path;
  const language = languageFromPath(visual.path);
  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background">
      <div className="flex min-w-0 items-center gap-1 border-b border-border/60 bg-muted/30 px-2 py-1">
        <button
          aria-expanded={open}
          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            setOpen((value) => !value);
          }}
          type="button"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open ? 'rotate-180' : '',
            )}
          />
          <FileText className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="min-w-0 truncate text-xs font-medium" title={displayTitle}>
            {displayTitle}
          </span>
        </button>
        {copyText !== undefined ? (
          <CopyBlockButton className="size-6 opacity-80 hover:opacity-100" text={copyText} />
        ) : null}
        <ToolDetailButton detailText={detailText} sections={detailSections} />
      </div>
      {open ? <LineNumberedText language={language} text={takeShort(visual.text)} /> : null}
    </div>
  );
};

const SearchResultsVisual: FC<{
  readonly visual: Extract<AcpToolVisualView, { kind: 'search-results' }>;
  readonly title?: string;
  readonly detailText?: string;
  readonly detailSections?: readonly ToolDetailSection[];
}> = ({ visual, title, detailText, detailSections }) => {
  const [open, setOpen] = useState(false);
  const displayTitle = title ?? visual.pattern ?? '検索結果';
  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background">
      <div className="flex min-w-0 items-center gap-1 border-b border-border/60 bg-muted/30 px-2 py-1">
        <button
          aria-expanded={open}
          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            setOpen((value) => !value);
          }}
          type="button"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open ? 'rotate-180' : '',
            )}
          />
          <Search className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="min-w-0 truncate text-xs font-medium" title={displayTitle}>
            {displayTitle}
          </span>
        </button>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {visual.numFiles ?? visual.filenames.length} files
        </span>
        {visual.truncated ? (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            truncated
          </span>
        ) : null}
        <ToolDetailButton detailText={detailText} sections={detailSections} />
      </div>
      {open ? (
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
      ) : null}
      {open && visual.durationMs !== null ? (
        <div className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground">
          {visual.durationMs}ms
        </div>
      ) : null}
    </div>
  );
};

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
  readonly title?: string;
  readonly defaultOpen?: boolean;
  readonly detailText?: string;
  readonly detailSections?: readonly ToolDetailSection[];
}> = ({ visual, title, defaultOpen, detailText, detailSections }) => (
  <div className="space-y-2">
    {visual.files.map((file) => (
      <DiffViewer
        defaultCollapsed={defaultOpen !== true}
        fileDiff={file}
        headerTitle={title}
        headerTrailing={<ToolDetailButton detailText={detailText} sections={detailSections} />}
        headerTone="muted"
        key={file.filename}
      />
    ))}
  </div>
);

export const AcpToolVisualViewBlock: FC<{
  readonly visual: AcpToolVisualView;
  readonly title?: string;
  readonly copyText?: string;
  readonly defaultOpen?: boolean;
  readonly detailText?: string;
  readonly detailSections?: readonly ToolDetailSection[];
}> = ({ visual, title, copyText, defaultOpen, detailText, detailSections }) => {
  if (visual.kind === 'terminal') {
    return (
      <TerminalVisual
        copyText={copyText}
        detailText={detailText}
        detailSections={detailSections}
        visual={visual}
      />
    );
  }
  if (visual.kind === 'file-read') {
    return (
      <FileReadVisual
        copyText={copyText}
        defaultOpen={defaultOpen}
        detailText={detailText}
        detailSections={detailSections}
        title={title}
        visual={visual}
      />
    );
  }
  if (visual.kind === 'search-results') {
    return (
      <SearchResultsVisual
        detailText={detailText}
        detailSections={detailSections}
        title={title}
        visual={visual}
      />
    );
  }
  if (visual.kind === 'diff') {
    return (
      <DiffVisual
        defaultOpen={defaultOpen}
        detailText={detailText}
        detailSections={detailSections}
        title={title}
        visual={visual}
      />
    );
  }
  return <TodosVisual visual={visual} />;
};

const RawToolUseCard: FC<{
  readonly item: AcpToolMergeItem;
  readonly title: string;
  readonly copyText: string;
  readonly className?: string;
}> = ({ item, title, copyText, className }) => {
  const { call, result, error } = item;
  const [open, setOpen] = useState(false);
  const renderRawSection = ({
    title: sectionTitle,
    text,
    language,
    tone,
  }: {
    readonly title: string;
    readonly text: string;
    readonly language: string;
    readonly tone?: 'error';
  }) => {
    const formatted = formatJsonLike(text.length > 0 ? text : '（空）');
    return (
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h4
            className={cn(
              'min-w-0 flex-1 text-xs font-medium text-muted-foreground',
              tone === 'error' ? 'text-destructive' : '',
            )}
          >
            {sectionTitle}
          </h4>
          <CopyBlockButton className="size-6 opacity-80 hover:opacity-100" text={text} />
        </div>
        <HighlightedPre
          className={cn(
            'max-h-64 bg-background/80 p-2',
            tone === 'error' ? 'border-destructive/25 bg-destructive/5 text-destructive' : '',
          )}
          language={language === 'json' ? formatted.language : language}
          text={take(language === 'json' ? formatted.text : text)}
        />
      </div>
    );
  };
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
          {call !== null
            ? renderRawSection({
                title: '入力 (args)',
                text: call.inputText,
                language: 'json',
              })
            : null}
          {error !== null
            ? renderRawSection({
                title: 'エラー',
                text: error.errorText,
                language: 'text',
                tone: 'error',
              })
            : null}
          {result !== null
            ? renderRawSection({
                title: '戻り値 (output)',
                text: result.outputText,
                language: 'json',
              })
            : null}
        </CardContent>
      ) : null}
    </Card>
  );
};

const toolDetailSections = ({
  call,
  result,
  error,
}: {
  readonly call: AcpToolMergeItem['call'];
  readonly result: AcpToolMergeItem['result'];
  readonly error: AcpToolMergeItem['error'];
}): readonly ToolDetailSection[] => [
  ...(call !== null ? [{ title: 'Input', text: call.inputText, language: 'json' }] : []),
  ...(result !== null ? [{ title: 'Output', text: result.outputText, language: 'json' }] : []),
  ...(error !== null ? [{ title: 'Error', text: error.errorText, language: 'text' }] : []),
];

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
  const effectiveVisual =
    visual?.kind === 'terminal' && visual.command.trim().length === 0 ? null : visual;

  if (effectiveVisual !== null) {
    return (
      <div className={cn('w-full min-w-0', className)}>
        <AcpToolVisualViewBlock
          copyText={copyText}
          detailSections={toolDetailSections({ call, result, error })}
          title={title}
          visual={effectiveVisual}
        />
      </div>
    );
  }

  return <RawToolUseCard className={className} copyText={copyText} item={item} title={title} />;
};
