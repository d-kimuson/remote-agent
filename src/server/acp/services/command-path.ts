import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isExecutableFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const ancestorNodeModuleBins = (startPath: string): readonly string[] => {
  const directories: string[] = [];
  let current = path.dirname(startPath);
  while (true) {
    directories.push(path.join(current, 'node_modules', '.bin'));
    const parent = path.dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
};

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

const candidatePaths = (command: string): readonly string[] => {
  if (command.includes(path.sep)) {
    return [command];
  }

  const localBinCandidates = unique([
    ...ancestorNodeModuleBins(path.join(process.cwd(), 'remote-agent.cwd')),
    ...ancestorNodeModuleBins(fileURLToPath(import.meta.url)),
    ...ancestorNodeModuleBins(process.argv[1] ?? fileURLToPath(import.meta.url)),
  ]).map((directory) => path.join(directory, command));
  const pathValue = process.env['PATH'] ?? '';
  if (pathValue.length === 0) {
    return localBinCandidates;
  }

  return [
    ...localBinCandidates,
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
