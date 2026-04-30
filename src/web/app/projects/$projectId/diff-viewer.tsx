import { ChevronDown, Copy } from 'lucide-react';
import { memo, useState, type FC, type ReactNode } from 'react';

import type { DiffHunk, DiffLine, FileDiff } from './diff-viewer.pure.ts';

import { Button } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/utils.ts';

type DiffViewerProps = {
  readonly fileDiff: FileDiff;
  readonly className?: string;
  readonly defaultCollapsed?: boolean;
  readonly headerTitle?: string;
  readonly headerTone?: 'default' | 'muted';
  readonly headerTrailing?: ReactNode;
};

type DiffHunkProps = {
  readonly hunk: DiffHunk;
};

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
}> = ({ hunks }) => (
  <>
    {hunks.map((hunk) => (
      <div key={`${hunk.oldStart}-${hunk.newStart}`}>
        {hunk.lines.map((line, index) => (
          <div
            className={cn('relative min-w-full border-l-4', getRowClasses(line.type), {
              'border-green-200 border-l-green-400 dark:border-green-800/50': line.type === 'added',
              'border-red-200 border-l-red-400 dark:border-red-800/50': line.type === 'deleted',
              'border-blue-200 border-l-blue-400 dark:border-blue-800/50': line.type === 'hunk',
              'border-gray-100 border-l-transparent dark:border-gray-800':
                line.type === 'unchanged' || line.type === 'context',
            })}
            data-slot="diff-row"
            key={`content-${hunk.oldStart}-${hunk.newStart}-${getLineKey(line, index)}`}
          >
            <div
              className="relative min-w-0 px-2 py-0.5 pl-7 font-mono text-xs leading-tight whitespace-pre"
              data-slot="diff-row-content"
            >
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
        ))}
      </div>
    ))}
  </>
);

const DiffBody: FC<{
  readonly hunks: readonly DiffHunk[];
}> = ({ hunks }) => (
  <div className="relative flex">
    <div className="w-20 shrink-0">
      {hunks.map((hunk) => (
        <DiffHunkComponent hunk={hunk} key={`${hunk.oldStart}-${hunk.newStart}`} />
      ))}
    </div>
    <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="inline-block w-max min-w-full align-top">
        <DiffContentRows hunks={hunks} />
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
  ({ fileDiff, className, defaultCollapsed, headerTitle, headerTone, headerTrailing }) => {
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
            <DiffBody hunks={fileDiff.hunks} />
          </div>
        ) : null}
      </div>
    );
  },
);

DiffViewer.displayName = 'DiffViewer';
