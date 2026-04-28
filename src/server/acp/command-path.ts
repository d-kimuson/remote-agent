import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

const isExecutableFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const candidatePaths = (command: string): readonly string[] => {
  if (command.includes(path.sep)) {
    return [command];
  }

  const localBinCandidate = path.join(process.cwd(), "node_modules", ".bin", command);
  const pathValue = process.env["PATH"] ?? "";
  if (pathValue.length === 0) {
    return [localBinCandidate];
  }

  return [
    localBinCandidate,
    ...pathValue
      .split(path.delimiter)
      .filter((entry) => entry.length > 0)
      .map((entry) => path.join(entry, command)),
  ];
};

export const resolveCommandPath = async (command: string): Promise<string | null> => {
  const candidates = candidatePaths(command);

  for (const candidate of candidates) {
    if (await isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return null;
};
