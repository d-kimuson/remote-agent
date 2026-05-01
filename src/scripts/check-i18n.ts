import { defaultLanguage, resources, supportedLanguages } from '../web/lib/i18n/resources.ts';

type FlatTranslations = ReadonlyMap<string, string>;

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

const allFailures = [...failures, ...identicalPrimaryFailures];

if (allFailures.length > 0) {
  console.error(`i18n check failed with ${String(allFailures.length)} issue(s):`);
  for (const failure of allFailures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
