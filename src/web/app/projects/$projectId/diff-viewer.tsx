import { ChevronDown, Copy, MessageSquarePlus, SendHorizonal, Trash2, X } from 'lucide-react';
import { memo, useMemo, useState, type FC, type ReactNode } from 'react';

import type { DiffHunk, DiffLine, FileDiff } from './diff-viewer.pure.ts';
import type { ReviewComment } from './review-comments.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Textarea } from '../../../components/ui/textarea.tsx';
import { cn } from '../../../lib/utils.ts';

type DiffViewerProps = {
  readonly fileDiff: FileDiff;
  readonly className?: string;
  readonly defaultCollapsed?: boolean;
  readonly headerTitle?: string;
  readonly headerTone?: 'default' | 'muted';
  readonly headerTrailing?: ReactNode;
  readonly review?: {
    readonly filename: string;
    readonly comments: readonly ReviewComment[];
    readonly onAddComment: (comment: Omit<ReviewComment, 'id' | 'createdAt'>) => void;
    readonly onRemoveComment: (commentId: string) => void;
  };
};

type DiffHunkProps = {
  readonly hunk: DiffHunk;
};

type DiffReviewProps = NonNullable<DiffViewerProps['review']>;

const lineNumberFromDiffLine = (line: DiffLine): number =>
  line.newLineNumber ?? line.oldLineNumber ?? 0;

const getRowClasses = (type: DiffLine['type']) =>
  cn({
    'bg-green-50 dark:bg-green-950/30': type === 'added',
    'bg-red-50 dark:bg-red-950/30': type === 'deleted',
    'bg-blue-50 dark:bg-blue-950/30': type === 'hunk',
    'bg-white dark:bg-gray-900': type === 'unchanged' || type === 'context',
  });

const getStickyCellClasses = (type: DiffLine['type']) =>
  cn({
    'bg-green-50 dark:bg-green-950': type === 'added',
    'bg-red-50 dark:bg-red-950': type === 'deleted',
    'bg-blue-50 dark:bg-blue-950': type === 'hunk',
    'bg-white dark:bg-gray-900': type === 'unchanged' || type === 'context',
  });

const getLineKey = (line: DiffLine, index: number): string =>
  `${index}-${line.oldLineNumber ?? ''}-${line.newLineNumber ?? ''}-${line.type}-${line.content}`;

const DiffHunkComponent: FC<DiffHunkProps> = ({ hunk }) => (
  <div className="w-20 shrink-0">
    <div>
      {hunk.lines.map((line, index) => (
        <div
          className={cn(
            'grid grid-cols-[2.5rem_2.5rem] border-r border-l-4 font-mono',
            getStickyCellClasses(line.type),
            {
              'border-green-200 border-l-green-400 dark:border-green-800/50': line.type === 'added',
              'border-red-200 border-l-red-400 dark:border-red-800/50': line.type === 'deleted',
              'border-blue-200 border-l-blue-400 dark:border-blue-800/50': line.type === 'hunk',
              'border-gray-200 border-l-transparent dark:border-gray-700':
                line.type === 'unchanged' || line.type === 'context',
            },
          )}
          key={`gutter-${getLineKey(line, index)}`}
        >
          <div className="border-r border-gray-200 px-1 py-0.5 text-right text-xs leading-tight tabular-nums dark:border-gray-700">
            {line.type !== 'added' && line.type !== 'hunk' && line.oldLineNumber !== undefined
              ? line.oldLineNumber
              : '\u00A0'}
          </div>
          <div className="px-1 py-0.5 text-right text-xs leading-tight tabular-nums">
            {line.type !== 'deleted' && line.type !== 'hunk' && line.newLineNumber !== undefined
              ? line.newLineNumber
              : '\u00A0'}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const DiffContentRows: FC<{
  readonly hunks: readonly DiffHunk[];
  readonly review?: DiffReviewProps;
}> = ({ hunks, review }) => {
  const commentsByLine = useMemo(() => {
    const map = new Map<number, readonly ReviewComment[]>();
    if (review === undefined) {
      return map;
    }

    for (const comment of review.comments) {
      if (comment.filename !== review.filename) {
        continue;
      }
      map.set(comment.lineNumber, [...(map.get(comment.lineNumber) ?? []), comment]);
    }
    return map;
  }, [review]);

  return (
    <>
      {hunks.map((hunk) => (
        <div key={`${hunk.oldStart}-${hunk.newStart}`}>
          {hunk.lines.map((line, index) => {
            const lineNumber = lineNumberFromDiffLine(line);
            const lineComments = commentsByLine.get(lineNumber) ?? [];
            return (
              <DiffContentRow
                comments={lineComments}
                hunk={hunk}
                index={index}
                key={`content-${hunk.oldStart}-${hunk.newStart}-${getLineKey(line, index)}`}
                line={line}
                review={review}
              />
            );
          })}
        </div>
      ))}
    </>
  );
};

const DiffContentRow: FC<{
  readonly hunk: DiffHunk;
  readonly line: DiffLine;
  readonly index: number;
  readonly review?: DiffReviewProps;
  readonly comments: readonly ReviewComment[];
}> = ({ hunk, line, index, review, comments }) => {
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const canComment = review !== undefined && line.type !== 'hunk';

  const handleSaveComment = () => {
    if (review === undefined) {
      return;
    }
    const content = commentText.trim();
    if (content.length === 0) {
      return;
    }
    review.onAddComment({
      filename: review.filename,
      lineNumber: lineNumberFromDiffLine(line),
      lineType: line.type,
      content,
    });
    setCommentText('');
    setIsCommentOpen(false);
  };

  return (
    <div>
      <div
        className={cn('relative min-w-full border-l-4', getRowClasses(line.type), {
          group: canComment,
          'border-green-200 border-l-green-400 dark:border-green-800/50': line.type === 'added',
          'border-red-200 border-l-red-400 dark:border-red-800/50': line.type === 'deleted',
          'border-blue-200 border-l-blue-400 dark:border-blue-800/50': line.type === 'hunk',
          'border-gray-100 border-l-transparent dark:border-gray-800':
            line.type === 'unchanged' || line.type === 'context',
        })}
        data-slot="diff-row"
      >
        <div
          className="relative min-w-0 px-2 py-0.5 pl-7 font-mono text-xs leading-tight whitespace-pre"
          data-slot="diff-row-content"
        >
          {canComment ? (
            <button
              className={cn(
                'absolute top-px left-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm transition-all',
                comments.length > 0
                  ? 'bg-sky-500 px-1 text-[10px] font-semibold text-white shadow-sm'
                  : 'text-muted-foreground/70 opacity-100 hover:bg-primary/10 hover:text-primary md:opacity-0 md:group-hover:opacity-100',
              )}
              onClick={() => {
                setIsCommentOpen((value) => !value);
              }}
              type="button"
            >
              {comments.length > 0 ? comments.length : <MessageSquarePlus className="size-3.5" />}
            </button>
          ) : null}
          <span
            className={cn('absolute top-0.5 left-2 w-4 text-center', {
              'text-green-600 dark:text-green-400': line.type === 'added',
              'text-red-600 dark:text-red-400': line.type === 'deleted',
              'font-medium text-blue-600 dark:text-blue-400': line.type === 'hunk',
              'text-gray-400 dark:text-gray-600':
                line.type === 'unchanged' || line.type === 'context',
            })}
            data-slot="diff-sign"
          >
            {line.type === 'added'
              ? '+'
              : line.type === 'deleted'
                ? '-'
                : line.type === 'hunk'
                  ? '@'
                  : '\u00A0'}
          </span>
          <span className="inline-block w-max min-w-full pr-4">{line.content || ' '}</span>
        </div>
      </div>
      {isCommentOpen && review !== undefined ? (
        <div
          className="fixed right-[calc(2.5vw+0.25rem)] bottom-4 left-[calc(2.5vw+0.25rem)] z-50 max-h-[70dvh] min-w-0 overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 shadow-xl md:sticky md:right-auto md:bottom-auto md:left-0 md:z-10 md:w-[min(40rem,calc(95vw-5rem))] md:max-w-xl md:rounded-none md:border-0 md:border-l-4 md:border-l-sky-400 md:shadow-none"
          key={`comment-${hunk.oldStart}-${hunk.newStart}-${getLineKey(line, index)}`}
        >
          {comments.length > 0 ? (
            <div className="mb-2 space-y-1.5">
              {comments.map((comment) => (
                <div
                  className="group/comment relative rounded-md border bg-muted/30 px-2.5 py-2"
                  key={comment.id}
                >
                  <p className="pr-5 text-[13px] leading-relaxed">{comment.content}</p>
                  <button
                    className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      review.onRemoveComment(comment.id);
                    }}
                    type="button"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <Textarea
            className="min-h-20 resize-y border-border/60 bg-background text-[13px]"
            onChange={(event) => {
              setCommentText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSaveComment();
              }
            }}
            placeholder="Add a comment..."
            value={commentText}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Cmd/Ctrl + Enter</span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                className="size-7 p-0"
                onClick={() => {
                  setIsCommentOpen(false);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
              <Button
                className="h-7 gap-1 rounded-full px-3 text-[11px]"
                disabled={commentText.trim().length === 0}
                onClick={handleSaveComment}
                size="sm"
                type="button"
              >
                <SendHorizonal className="size-3" />
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DiffBody: FC<{
  readonly hunks: readonly DiffHunk[];
  readonly review?: DiffReviewProps;
}> = ({ hunks, review }) => (
  <div className="relative flex">
    <div className="w-20 shrink-0">
      {hunks.map((hunk) => (
        <DiffHunkComponent hunk={hunk} key={`${hunk.oldStart}-${hunk.newStart}`} />
      ))}
    </div>
    <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="inline-block w-max min-w-full align-top">
        <DiffContentRows hunks={hunks} review={review} />
      </div>
    </div>
  </div>
);

const FileHeader: FC<{
  readonly fileDiff: FileDiff;
  readonly headerTitle?: string;
  readonly headerTone?: 'default' | 'muted';
  readonly headerTrailing?: ReactNode;
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: () => void;
}> = ({
  fileDiff,
  headerTitle,
  headerTone = 'default',
  headerTrailing,
  isCollapsed,
  onToggleCollapse,
}) => {
  const fileStatus = fileDiff.isNew
    ? { label: 'A', className: 'text-green-600 dark:text-green-400' }
    : fileDiff.isDeleted
      ? { label: 'D', className: 'text-red-600 dark:text-red-400' }
      : fileDiff.isRenamed
        ? { label: 'R', className: 'text-blue-600 dark:text-blue-400' }
        : { label: 'M', className: 'text-gray-600 dark:text-gray-400' };

  return (
    <div
      className={cn(
        'sticky top-0 z-20 w-full transition-colors',
        headerTone === 'muted'
          ? 'bg-muted/30 px-2 py-1 hover:bg-muted/50'
          : 'bg-gray-50 px-3 py-1.5 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700',
      )}
    >
      <div className="flex items-center gap-1">
        <button
          aria-expanded={!isCollapsed}
          className="min-w-0 flex-1 rounded px-1 py-0.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onToggleCollapse}
          type="button"
        >
          <div className="flex w-full items-center gap-2">
            <ChevronDown
              className={cn(
                'size-4 shrink-0 transition-transform',
                headerTone === 'muted' ? 'text-muted-foreground' : 'text-gray-500',
                isCollapsed ? '' : 'rotate-180',
              )}
            />
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px]">
              <span className={fileStatus.className}>{fileStatus.label}</span>
            </div>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-left text-xs font-medium',
                headerTone === 'muted' ? 'text-foreground' : 'font-mono text-black dark:text-white',
              )}
              title={headerTitle ?? fileDiff.filename}
            >
              {headerTitle ?? fileDiff.filename}
            </span>
            <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {fileDiff.linesAdded > 0 ? (
                <span className="text-green-600 dark:text-green-400">+{fileDiff.linesAdded}</span>
              ) : null}
              {fileDiff.linesDeleted > 0 ? (
                <span className="text-red-600 dark:text-red-400">-{fileDiff.linesDeleted}</span>
              ) : null}
            </div>
          </div>
        </button>
        {headerTrailing !== undefined ? <div className="shrink-0">{headerTrailing}</div> : null}
        <Button
          className="h-6 w-6 shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard.writeText(fileDiff.filename);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Copy className="h-3 w-3 text-gray-500 dark:text-gray-400" />
        </Button>
      </div>
      {fileDiff.isBinary ? (
        <div className="mt-2 text-left text-xs text-gray-500 dark:text-gray-400">
          Binary file (content not shown)
        </div>
      ) : null}
    </div>
  );
};

export const DiffViewer: FC<DiffViewerProps> = memo(
  ({ fileDiff, className, defaultCollapsed, headerTitle, headerTone, headerTrailing, review }) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed ?? false);
    const toggleCollapse = () => {
      setIsCollapsed((value) => !value);
    };

    return (
      <div
        className={cn(
          'overflow-hidden rounded-lg border',
          headerTone === 'muted'
            ? 'border-border/70 bg-background'
            : 'border-gray-200 dark:border-gray-700',
          className,
        )}
      >
        <FileHeader
          fileDiff={fileDiff}
          headerTitle={headerTitle}
          headerTone={headerTone}
          headerTrailing={headerTrailing}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        {!isCollapsed && fileDiff.isBinary ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Binary file cannot be displayed
          </div>
        ) : null}
        {!isCollapsed && !fileDiff.isBinary ? (
          <div
            className={cn(
              'border-t',
              headerTone === 'muted' ? 'border-border/60' : 'border-gray-200 dark:border-gray-700',
            )}
          >
            <DiffBody hunks={fileDiff.hunks} review={review} />
          </div>
        ) : null}
      </div>
    );
  },
);

DiffViewer.displayName = 'DiffViewer';
