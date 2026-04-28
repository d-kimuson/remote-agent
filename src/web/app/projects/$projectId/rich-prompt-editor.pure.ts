export type RichPromptFormat = "bold" | "italic" | "code" | "bulletList" | "quote";

export type RichPromptSelection = {
  readonly start: number;
  readonly end: number;
};

export type RichPromptEditResult = {
  readonly value: string;
  readonly selection: RichPromptSelection;
};

const normalizeSelection = ({ end, start }: RichPromptSelection): RichPromptSelection =>
  start <= end ? { start, end } : { start: end, end: start };

const applyInlineFormat = ({
  selection,
  suffix,
  prefix,
  value,
}: {
  readonly value: string;
  readonly selection: RichPromptSelection;
  readonly prefix: string;
  readonly suffix: string;
}): RichPromptEditResult => {
  const { end, start } = normalizeSelection(selection);
  const selected = value.slice(start, end);
  const nextValue = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
  const nextStart = start + prefix.length;

  return {
    value: nextValue,
    selection: {
      start: nextStart,
      end: nextStart + selected.length,
    },
  };
};

const lineRangeFor = (value: string, selection: RichPromptSelection): RichPromptSelection => {
  const { end, start } = normalizeSelection(selection);
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", end);

  return {
    start: lineStart,
    end: nextLineBreak === -1 ? value.length : nextLineBreak,
  };
};

const applyLinePrefix = ({
  prefix,
  selection,
  value,
}: {
  readonly value: string;
  readonly selection: RichPromptSelection;
  readonly prefix: string;
}): RichPromptEditResult => {
  const range = lineRangeFor(value, selection);
  const block = value.slice(range.start, range.end);
  const nextBlock = block
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0 || line.startsWith(prefix)) {
        return line;
      }
      return `${prefix}${line}`;
    })
    .join("\n");
  const nextValue = `${value.slice(0, range.start)}${nextBlock}${value.slice(range.end)}`;

  return {
    value: nextValue,
    selection: {
      start: range.start,
      end: range.start + nextBlock.length,
    },
  };
};

export const applyRichPromptFormat = ({
  format,
  selection,
  value,
}: {
  readonly value: string;
  readonly selection: RichPromptSelection;
  readonly format: RichPromptFormat;
}): RichPromptEditResult => {
  if (format === "bold") {
    return applyInlineFormat({ value, selection, prefix: "**", suffix: "**" });
  }
  if (format === "italic") {
    return applyInlineFormat({ value, selection, prefix: "_", suffix: "_" });
  }
  if (format === "code") {
    return applyInlineFormat({ value, selection, prefix: "`", suffix: "`" });
  }
  if (format === "bulletList") {
    return applyLinePrefix({ value, selection, prefix: "- " });
  }
  if (format === "quote") {
    return applyLinePrefix({ value, selection, prefix: "> " });
  }

  const exhaustive: never = format;
  return exhaustive;
};

export const replaceRichPromptSelection = ({
  replacement,
  selection,
  value,
}: {
  readonly value: string;
  readonly selection: RichPromptSelection;
  readonly replacement: string;
}): RichPromptEditResult => {
  const { end, start } = normalizeSelection(selection);
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const nextOffset = start + replacement.length;

  return {
    value: nextValue,
    selection: {
      start: nextOffset,
      end: nextOffset,
    },
  };
};
