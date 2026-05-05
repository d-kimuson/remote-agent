import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { defaultLanguage, resources, supportedLanguages } from '../web/lib/i18n/resources.ts';

type FlatTranslations = ReadonlyMap<string, string>;

type UsedTranslationKey = {
  readonly file: string;
  readonly key: string;
  readonly line: number;
};

const flattenTranslations = (value: unknown, prefix = ''): FlatTranslations => {
  if (typeof value === 'string') {
    return new Map([[prefix, value]]);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return new Map();
  }

  return Object.entries(value).reduce<ReadonlyMap<string, string>>((accumulator, [key, child]) => {
    const nextPrefix = prefix.length === 0 ? key : `${prefix}.${key}`;
    return new Map([...accumulator, ...flattenTranslations(child, nextPrefix)]);
  }, new Map());
};

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

const missingKeys = ({
  baseline,
  candidate,
}: {
  readonly baseline: FlatTranslations;
  readonly candidate: FlatTranslations;
}): readonly string[] => sorted(baseline.keys()).filter((key) => !candidate.has(key));

const identicalPrimaryKeyValues = (primary: FlatTranslations): readonly string[] =>
  [...primary.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .filter(([key, value]) => key === value.trim())
    .map(([key]) => key);

const sourceFiles = (directory: string): readonly string[] => {
  const entries = readdirSync(directory).sort();
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return sourceFiles(path);
    }
    if (/\.[jt]sx?$/.test(entry)) {
      return [path];
    }
    return [];
  });
};

const lineNumberAt = (content: string, index: number): number =>
  content.slice(0, index).split('\n').length;

const staticTCallPattern = /(?<![\w$])t\(\s*(['"`])([^'"`${}]+)\1/g;

const usedTranslationKeys = (files: readonly string[]): readonly UsedTranslationKey[] =>
  files.flatMap((file) => {
    const content = readFileSync(file, 'utf8');
    return [...content.matchAll(staticTCallPattern)].map((match) => ({
      file: relative(process.cwd(), file),
      key: match[2] ?? '',
      line: lineNumberAt(content, match.index ?? 0),
    }));
  });

const missingUsedKeys = ({
  primary,
  usedKeys,
}: {
  readonly primary: FlatTranslations;
  readonly usedKeys: readonly UsedTranslationKey[];
}): readonly UsedTranslationKey[] =>
  usedKeys
    .filter(({ key }) => !primary.has(key))
    .sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        left.file.localeCompare(right.file) ||
        left.line - right.line,
    );

const primaryTranslations = flattenTranslations(resources[defaultLanguage].translation);
const failures = supportedLanguages.flatMap((language) => {
  const translations = flattenTranslations(resources[language].translation);
  const missingFromLocale = missingKeys({
    baseline: primaryTranslations,
    candidate: translations,
  });
  const extraInLocale = missingKeys({
    baseline: translations,
    candidate: primaryTranslations,
  });

  return [
    ...missingFromLocale.map((key) => `${language}: missing key '${key}'`),
    ...extraInLocale.map((key) => `${language}: extra key '${key}'`),
  ];
});

const identicalPrimaryFailures = identicalPrimaryKeyValues(primaryTranslations).map(
  (key) => `${defaultLanguage}: primary key and value are identical for '${key}'`,
);

const missingUsedKeyFailures = missingUsedKeys({
  primary: primaryTranslations,
  usedKeys: usedTranslationKeys(sourceFiles(join(process.cwd(), 'src/web'))),
}).map(
  ({ file, key, line }) =>
    `used key '${key}' is missing from ${defaultLanguage} resources (${file}:${String(line)})`,
);

const allFailures = [...failures, ...identicalPrimaryFailures, ...missingUsedKeyFailures];

if (allFailures.length > 0) {
  console.error(`i18n check failed with ${String(allFailures.length)} issue(s):`);
  for (const failure of allFailures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
