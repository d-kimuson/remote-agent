import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { array, object, optional, parse, record, string, unknown as unknownSchema } from 'valibot';

const bundledPackagesFilePath = path.resolve('.local/tsdown-bundled-packages.json');
const deniedLicensePattern =
  /\b(AGPL|GPL|LGPL|SSPL|BUSL)\b|Commons Clause|UNLICENSED|All rights reserved|UNKNOWN/i;
const packageJsonSchema = object({
  name: string(),
  version: string(),
  license: optional(unknownSchema()),
  licenses: optional(array(unknownSchema())),
});
const bundledPackagesSchema = array(
  object({
    name: string(),
    version: string(),
    packageDirectory: string(),
  }),
);
const licenseOverrides: Record<string, string> = {
  '@mcpc-tech/acp-ai-provider': 'MIT',
};

const toLicense = (
  licenseValue: unknown,
  licensesValue: readonly unknown[] | undefined,
): string => {
  if (typeof licenseValue === 'string' && licenseValue.trim().length > 0) {
    return licenseValue.trim();
  }

  if (licensesValue !== undefined) {
    const licenses = licensesValue
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        const parsed = parse(optional(record(string(), string())), entry);
        return parsed?.['type'];
      })
      .filter((license) => license !== undefined && license.length > 0);
    if (licenses.length > 0) {
      return licenses.join(' OR ');
    }
  }

  return 'UNKNOWN';
};

if (!existsSync(bundledPackagesFilePath)) {
  console.error(
    `Bundled package metadata was not found at ${bundledPackagesFilePath}. Run pnpm build first.`,
  );
  process.exit(1);
}

const bundledPackages = parse(
  bundledPackagesSchema,
  JSON.parse(readFileSync(bundledPackagesFilePath, 'utf8')),
);
const violations = bundledPackages
  .map((bundledPackage) => {
    const packageJsonPath = path.join(bundledPackage.packageDirectory, 'package.json');
    const packageJson = parse(packageJsonSchema, JSON.parse(readFileSync(packageJsonPath, 'utf8')));
    return {
      name: packageJson.name,
      version: packageJson.version,
      license:
        licenseOverrides[packageJson.name] ?? toLicense(packageJson.license, packageJson.licenses),
    };
  })
  .filter((entry) => deniedLicensePattern.test(entry.license));

if (violations.length > 0) {
  console.error('Licenses incompatible with MIT distribution were found in bundled packages:');
  for (const violation of violations) {
    console.error(`- ${violation.name}@${violation.version}: ${violation.license}`);
  }
  process.exit(1);
}

console.log(`Checked ${bundledPackages.length} bundled package licenses.`);
