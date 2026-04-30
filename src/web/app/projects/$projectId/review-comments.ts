import { useCallback, useMemo, useState } from 'react';
import {
  array,
  literal,
  number,
  object,
  parse,
  pipe,
  safeParse,
  string,
  trim,
  union,
  type InferOutput,
} from 'valibot';

const reviewCommentSchema = object({
  id: pipe(string(), trim()),
  filename: pipe(string(), trim()),
  lineNumber: number(),
  lineType: union([
    literal('added'),
    literal('deleted'),
    literal('unchanged'),
    literal('hunk'),
    literal('context'),
  ]),
  content: string(),
  createdAt: number(),
});

export type ReviewComment = InferOutput<typeof reviewCommentSchema>;

const reviewCommentStoreSchema = object({
  comments: array(reviewCommentSchema),
});

type ReviewCommentStore = InferOutput<typeof reviewCommentStoreSchema>;

const storageKeyForReviewSession = (reviewSessionId: string): string =>
  `remote-agent.review-comments.${reviewSessionId}`;

const emptyStore = { comments: [] } as const satisfies ReviewCommentStore;

const readReviewCommentStore = (reviewSessionId: string): ReviewCommentStore => {
  if (typeof window === 'undefined') {
    return emptyStore;
  }

  const rawValue = window.localStorage.getItem(storageKeyForReviewSession(reviewSessionId));
  if (rawValue === null) {
    return emptyStore;
  }

  try {
    const parsedJson: unknown = JSON.parse(rawValue);
    const parsed = safeParse(reviewCommentStoreSchema, parsedJson);
    return parsed.success ? parsed.output : emptyStore;
  } catch {
    return emptyStore;
  }
};

const writeReviewCommentStore = (reviewSessionId: string, store: ReviewCommentStore): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(
    storageKeyForReviewSession(reviewSessionId),
    JSON.stringify(parse(reviewCommentStoreSchema, store)),
  );
};

export const useReviewComments = (reviewSessionId: string) => {
  const [store, setStore] = useState<ReviewCommentStore>(() =>
    readReviewCommentStore(reviewSessionId),
  );
  const comments = useMemo((): readonly ReviewComment[] => store.comments, [store.comments]);

  const updateStore = useCallback(
    (updater: (store: ReviewCommentStore) => ReviewCommentStore) => {
      setStore((current) => {
        const next = updater(current);
        writeReviewCommentStore(reviewSessionId, next);
        return next;
      });
    },
    [reviewSessionId],
  );

  const addComment = useCallback(
    (comment: Omit<ReviewComment, 'id' | 'createdAt'>) => {
      const nextComment = {
        ...comment,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      } satisfies ReviewComment;
      updateStore((current) => ({ comments: [...current.comments, nextComment] }));
    },
    [updateStore],
  );

  const removeComment = useCallback(
    (commentId: string) => {
      updateStore((current) => ({
        comments: current.comments.filter((comment) => comment.id !== commentId),
      }));
    },
    [updateStore],
  );

  const clearComments = useCallback(() => {
    updateStore(() => emptyStore);
  }, [updateStore]);

  return { comments, addComment, removeComment, clearComments };
};

export const formatReviewMarkdown = (
  comments: readonly ReviewComment[],
  compareFrom: string,
  compareTo: string,
): string => {
  if (comments.length === 0) {
    return `## Review: ${compareFrom} vs ${compareTo}`;
  }

  const grouped = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    grouped.set(comment.filename, [...(grouped.get(comment.filename) ?? []), comment]);
  }

  const sections = [...grouped.keys()].sort().flatMap((filename) => {
    const fileComments = grouped.get(filename) ?? [];
    return [...fileComments]
      .sort((left, right) => left.lineNumber - right.lineNumber)
      .map((comment) => `### ${comment.filename} (L${comment.lineNumber})\n${comment.content}`);
  });

  return `## Review: ${compareFrom} vs ${compareTo}\n\n${sections.join('\n\n')}`;
};
