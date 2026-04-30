import { useMutation } from '@tanstack/react-query';
import {
  ClipboardPaste,
  FileText,
  GitBranch,
  GitCompare,
  Loader2,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { toast } from 'sonner';

import type { GitRevisionRef } from '../../../../shared/acp.ts';

import { Button } from '../../../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog.tsx';
import { Label } from '../../../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.tsx';
import { fetchGitDiff, fetchGitRevisions } from '../../../lib/api/acp.ts';
import { cn } from '../../../lib/utils.ts';
import { DiffViewer } from './diff-viewer.tsx';
import { formatReviewMarkdown, useReviewComments } from './review-comments.ts';

const defaultCompareFrom = 'HEAD';
const defaultCompareTo = 'working';

const RefIcon: FC<{ readonly type: GitRevisionRef['type'] }> = ({ type }) => {
  if (type === 'working') {
    return <GitCompare className="size-3.5" />;
  }
  return <GitBranch className="size-3.5" />;
};

const RefDisplay: FC<{ readonly refItem: GitRevisionRef }> = ({ refItem }) => (
  <span className="flex min-w-0 items-center gap-2">
    <RefIcon type={refItem.type} />
    <span className="truncate">{refItem.displayName}</span>
    {refItem.sha === undefined ? null : (
      <span className="font-mono text-[10px] text-muted-foreground">{refItem.sha.slice(0, 7)}</span>
    )}
  </span>
);

const RefSelector: FC<{
  readonly label: string;
  readonly value: string;
  readonly refs: readonly GitRevisionRef[];
  readonly onValueChange: (value: string) => void;
}> = ({ label, value, refs, onValueChange }) => {
  const selectedRef = refs.find((ref) => ref.name === value);
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`review-${label}`}>
        {label}
      </Label>
      <Select
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue);
          }
        }}
        value={value}
      >
        <SelectTrigger className="h-8 w-full text-xs" id={`review-${label}`}>
          <SelectValue>
            {selectedRef === undefined ? value : <RefDisplay refItem={selectedRef} />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {refs.map((ref) => (
            <SelectItem className="text-xs" key={ref.name} value={ref.name}>
              <RefDisplay refItem={ref} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

const DiffSummary: FC<{
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
}> = ({ filesChanged, insertions, deletions }) => (
  <div className="rounded-lg border bg-muted/20 p-2">
    <div className="flex items-center justify-between text-sm">
      <div className="flex min-w-0 items-center gap-1.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{filesChanged} files changed</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 font-medium">
        {insertions > 0 ? <span className="text-green-600">+{insertions}</span> : null}
        {deletions > 0 ? <span className="text-red-600">-{deletions}</span> : null}
      </div>
    </div>
  </div>
);

const ReviewDialogContent: FC<{
  readonly projectId: string;
  readonly cwd: string;
  readonly reviewSessionId: string;
  readonly onInsertReview: (markdown: string) => void;
  readonly onClose: () => void;
}> = ({ projectId, cwd, reviewSessionId, onInsertReview, onClose }) => {
  const [compareFrom, setCompareFrom] = useState(defaultCompareFrom);
  const [compareTo, setCompareTo] = useState(defaultCompareTo);
  const { comments, addComment, clearComments, removeComment } = useReviewComments(reviewSessionId);

  const {
    data: revisionsData,
    error: revisionsError,
    isPending: isRevisionsPending,
    mutate: loadRevisions,
  } = useMutation({
    mutationFn: () => fetchGitRevisions(projectId, { cwd }),
  });

  const {
    data: diff,
    error: diffError,
    isPending: isDiffPending,
    mutate: loadGitDiff,
  } = useMutation({
    mutationFn: () => fetchGitDiff(projectId, { fromRef: compareFrom, toRef: compareTo, cwd }),
  });

  const loadDiff = useCallback(() => {
    if (compareFrom.length === 0 || compareTo.length === 0 || compareFrom === compareTo) {
      return;
    }
    loadGitDiff();
  }, [compareFrom, compareTo, loadGitDiff]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  const refs =
    revisionsData?.refs ??
    ([
      { name: 'working', type: 'working', displayName: 'Uncommitted changes' },
      { name: 'HEAD', type: 'head', displayName: 'HEAD' },
    ] satisfies readonly GitRevisionRef[]);
  const isLoading = isRevisionsPending || isDiffPending;
  const error = revisionsError ?? diffError;

  const handleReset = () => {
    clearComments();
    toast.success('Review comments cleared');
  };

  const handleInsertReview = () => {
    onInsertReview(formatReviewMarkdown(comments, compareFrom, compareTo));
    toast.success('Review inserted into input');
    onClose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b px-3 py-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <RefSelector
            label="Compare from"
            onValueChange={setCompareFrom}
            refs={refs.filter((ref) => ref.name !== 'working')}
            value={compareFrom}
          />
          <RefSelector
            label="Compare to"
            onValueChange={setCompareTo}
            refs={refs}
            value={compareTo}
          />
        </div>
        <Button
          className="h-7 w-full text-xs"
          disabled={isLoading || compareFrom === compareTo}
          onClick={() => {
            loadRevisions();
            loadDiff();
          }}
          size="sm"
          type="button"
        >
          {isLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCcw className="size-3" />
          )}
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error === null ? null : (
          <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error.message}
          </div>
        )}

        {diff === undefined && !isLoading && error === null ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted/40">
                <GitCompare className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No items to review</p>
            </div>
          </div>
        ) : null}

        {diff === undefined || isLoading ? null : (
          <div>
            <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-3 py-2 backdrop-blur">
              <span className="text-xs text-muted-foreground">
                {comments.length === 0 ? 'No comments' : `${comments.length} comments`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  className="h-7 text-xs"
                  disabled={comments.length === 0}
                  onClick={handleReset}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3" />
                  Reset
                </Button>
                <Button
                  className="h-7 text-xs"
                  disabled={comments.length === 0}
                  onClick={handleInsertReview}
                  size="sm"
                  type="button"
                >
                  <ClipboardPaste className="size-3" />
                  Insert Review
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-3">
              <DiffSummary
                deletions={diff.summary.totalDeletions}
                filesChanged={diff.summary.totalFiles}
                insertions={diff.summary.totalAdditions}
              />
              <div className="space-y-2">
                {diff.files.map((file) => (
                  <DiffViewer
                    fileDiff={file}
                    key={file.filename}
                    review={{
                      filename: file.filename,
                      comments,
                      onAddComment: addComment,
                      onRemoveComment: removeComment,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="space-y-2 text-center">
              <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading diff...</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const ReviewDialogButton: FC<{
  readonly projectId: string;
  readonly cwd: string;
  readonly reviewSessionId: string;
  readonly disabled?: boolean;
  readonly onInsertReview: (markdown: string) => void;
}> = ({ projectId, cwd, reviewSessionId, disabled, onInsertReview }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label="Review changes"
            disabled={disabled}
            size="sm"
            title="Review changes"
            type="button"
            variant="ghost"
          >
            <GitCompare className="size-4" />
            <span className="hidden sm:inline">Review</span>
          </Button>
        }
      />
      <DialogContent
        className={cn(
          'flex h-[88vh] max-h-[900px] w-[95vw] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]',
        )}
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Review</DialogTitle>
          <DialogDescription>
            Git Diff View にコメントを付けて入力欄へ挿入します。
          </DialogDescription>
        </DialogHeader>
        {isOpen ? (
          <ReviewDialogContent
            key={reviewSessionId}
            cwd={cwd}
            onClose={() => {
              setIsOpen(false);
            }}
            onInsertReview={onInsertReview}
            projectId={projectId}
            reviewSessionId={reviewSessionId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
