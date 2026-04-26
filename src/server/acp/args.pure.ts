export const parseArgsText = (value: string | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }

  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};
