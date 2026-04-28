import type { FC, ReactNode } from 'react';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '../lib/utils.ts';

export type ChatMarkdownTone = 'default' | 'onPrimary';

export type ChatMarkdownProps = {
  readonly children: string;
  readonly className?: string;
  readonly tone?: ChatMarkdownTone;
};

const heading =
  (Tag: 'h1' | 'h2' | 'h3' | 'h4') =>
  ({ children }: { readonly children?: ReactNode }) => (
    <Tag
      className={cn(
        'font-semibold [text-wrap:pretty]',
        Tag === 'h1' && 'mb-2 mt-3 text-base first:mt-0',
        Tag === 'h2' && 'mb-2 mt-3 text-[0.95rem] first:mt-0',
        Tag === 'h3' && 'mb-1.5 mt-2.5 text-sm first:mt-0',
        Tag === 'h4' && 'mb-1.5 mt-2 text-sm first:mt-0',
      )}
    >
      {children}
    </Tag>
  );

const buildComponents = (tone: ChatMarkdownTone): Components => {
  const borderMuted = tone === 'onPrimary' ? 'border-primary-foreground/35' : 'border-border/70';
  const linkClass =
    tone === 'onPrimary'
      ? 'font-medium text-primary-foreground underline decoration-primary-foreground/60 underline-offset-2 hover:opacity-90'
      : 'font-medium text-primary underline decoration-primary/50 underline-offset-2 hover:opacity-90';
  const codeInline =
    tone === 'onPrimary'
      ? 'rounded bg-primary-foreground/15 px-1 py-0.5 font-mono text-[0.9em] break-words'
      : 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] break-words';
  const preBox =
    tone === 'onPrimary'
      ? 'my-2 overflow-x-auto rounded-md bg-primary-foreground/12 p-3 font-mono text-[0.85em] leading-relaxed'
      : 'my-2 overflow-x-auto rounded-md border border-border/50 bg-muted/35 p-3 font-mono text-[0.85em] leading-relaxed';
  const tableOuter = tone === 'onPrimary' ? 'border-primary-foreground/35' : 'border-border/40';

  return {
    p: ({ children }) => (
      <p className="mb-2 text-sm leading-relaxed last:mb-0 [text-wrap:pretty]">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">{children}</ol>
    ),
    li: ({ children }) => <li className="[text-wrap:pretty]">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="opacity-80">{children}</del>,
    a: ({ href, children }) => (
      <a className={linkClass} href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const isBlock = Boolean(className?.includes('language-'));
      if (isBlock) {
        return <code className={cn('block text-[0.9em] text-inherit', className)}>{children}</code>;
      }
      return <code className={codeInline}>{children}</code>;
    },
    pre: ({ children }) => <pre className={preBox}>{children}</pre>,
    blockquote: ({ children }) => (
      <blockquote
        className={cn(
          'my-2 border-l-2 pl-3 text-sm italic leading-relaxed opacity-90',
          borderMuted,
        )}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr className={cn('my-4 border-0 border-t', borderMuted)} />,
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    table: ({ children }) => (
      <div className={cn('my-2 overflow-x-auto rounded-md border', tableOuter)}>
        <table className="w-full min-w-[12rem] border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className={cn('bg-muted/40', tone === 'onPrimary' && 'bg-primary-foreground/10')}>
        {children}
      </thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className={cn('border-t', borderMuted)}>{children}</tr>,
    th: ({ children }) => (
      <th className={cn('border px-2 py-1.5 text-left font-semibold', borderMuted)}>{children}</th>
    ),
    td: ({ children }) => (
      <td className={cn('border px-2 py-1.5 align-top', borderMuted)}>{children}</td>
    ),
    img: ({ alt, src }) => (
      <img
        alt={alt ?? ''}
        className="my-2 max-h-96 max-w-full rounded-md object-contain"
        decoding="async"
        loading="lazy"
        src={src}
      />
    ),
    input: ({ checked, disabled, type }) =>
      type === 'checkbox' ? (
        <input
          checked={checked}
          className="mr-1.5 align-middle"
          disabled={disabled}
          readOnly
          type="checkbox"
        />
      ) : (
        <input checked={checked} disabled={disabled} type={type} />
      ),
  };
};

export const ChatMarkdown: FC<ChatMarkdownProps> = ({ children, className, tone = 'default' }) => {
  if (children.length === 0) {
    return null;
  }

  const components = buildComponents(tone);

  return (
    <div className={cn('min-w-0 [&_a]:break-words [&_code]:break-words', className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
};
