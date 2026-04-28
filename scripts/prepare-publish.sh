#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm build

node <<'NODE'
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const require = createRequire(`${rootDir}/package.json`);

const publishedSourceRoots = ['src/cli.ts', 'src/server', 'src/shared', 'src/web'];
const staticAssetPackages = ['@fontsource-variable/geist'];
const virtualRuntimePackages = ['workbox-window', 'workbox-routing', 'workbox-precaching'];
const ignoredSpecifiers = [/^node:/, /^@?\//, /^\./, /^virtual:/];
const deniedLicensePattern =
  /\b(AGPL|GPL|LGPL|SSPL|BUSL)\b|Commons Clause|UNLICENSED|All rights reserved|UNKNOWN/i;
const licenseOverrides = {
  '@mcpc-tech/acp-ai-provider': {
    license: 'MIT',
    source: 'https://github.com/mcpc-tech/mcpc/blob/main/LICENSE',
    text: `MIT License

Copyright (c) 2025 mcpc.tech

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
};

const toPackageName = (specifier) => {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return name === undefined ? specifier : `${scope}/${name}`;
  }
  return specifier.split('/')[0];
};

const listSourceFiles = (targetPath) => {
  const { readdirSync, statSync } = require('node:fs');
  const resolvedPath = path.resolve(rootDir, targetPath);
  if (!existsSync(resolvedPath)) {
    return [];
  }
  const stat = statSync(resolvedPath);
  if (stat.isFile()) {
    return /\.(tsx?|css)$/.test(resolvedPath) ? [resolvedPath] : [];
  }
  return readdirSync(resolvedPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(resolvedPath, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path.relative(rootDir, entryPath));
    }
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
};

const collectDirectPackages = () => {
  const packageNames = new Set([...staticAssetPackages, ...virtualRuntimePackages]);
  const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const filePath of publishedSourceRoots.flatMap(listSourceFiles)) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined || ignoredSpecifiers.some((pattern) => pattern.test(specifier))) {
        continue;
      }
      packageNames.add(toPackageName(specifier));
    }
  }

  return [...packageNames].sort();
};

const findPackageJson = (packageName, basePaths) => {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: basePaths });
  } catch {
    for (const basePath of basePaths) {
      const packageJsonPath = path.join(basePath, 'node_modules', packageName, 'package.json');
      if (existsSync(packageJsonPath)) {
        return packageJsonPath;
      }
    }
    try {
      const entryPath = require.resolve(packageName, { paths: basePaths });
      let current = path.dirname(entryPath);
      while (current !== path.dirname(current)) {
        const packageJsonPath = path.join(current, 'package.json');
        if (existsSync(packageJsonPath)) {
          return packageJsonPath;
        }
        current = path.dirname(current);
      }
    } catch {
      return null;
    }
  }
  return null;
};

const readPackage = (packageName, basePaths = [rootDir]) => {
  const packageJsonPath = findPackageJson(packageName, basePaths);
  if (packageJsonPath === null) {
    throw new Error(`Unable to resolve package metadata for ${packageName}`);
  }
  return {
    packageJsonPath,
    packageDirectory: path.dirname(packageJsonPath),
    packageJson: JSON.parse(readFileSync(packageJsonPath, 'utf8')),
  };
};

const collectRuntimePackages = () => {
  const packages = new Map();
  const queue = collectDirectPackages().map((packageName) => ({ packageName, basePaths: [rootDir] }));

  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) {
      continue;
    }

    const packageInfo = readPackage(next.packageName, next.basePaths);
    const key = `${packageInfo.packageJson.name}@${packageInfo.packageJson.version}`;
    if (packages.has(key)) {
      continue;
    }
    packages.set(key, packageInfo);

    const dependencyNames = [
      ...Object.keys(packageInfo.packageJson.dependencies ?? {}),
      ...Object.keys(packageInfo.packageJson.peerDependencies ?? {}),
    ].filter((dependencyName) => !dependencyName.startsWith('@types/'));

    for (const dependencyName of dependencyNames) {
      const dependencyPackageJsonPath = findPackageJson(dependencyName, [
        packageInfo.packageDirectory,
        rootDir,
      ]);
      if (dependencyPackageJsonPath !== null) {
        queue.push({ packageName: dependencyName, basePaths: [packageInfo.packageDirectory, rootDir] });
      }
    }
  }

  return [...packages.values()].sort((left, right) =>
    `${left.packageJson.name}@${left.packageJson.version}`.localeCompare(
      `${right.packageJson.name}@${right.packageJson.version}`,
    ),
  );
};

const findLicenseFile = (packageDirectory) => {
  const { readdirSync } = require('node:fs');
  const candidates = readdirSync(packageDirectory).filter((filename) =>
    /^(license|licence|copying|notice)(\..*)?$/i.test(filename),
  );
  const licenseFile = candidates.find((filename) => /^licen[sc]e/i.test(filename)) ?? candidates[0];
  return licenseFile === undefined ? null : path.join(packageDirectory, licenseFile);
};

const normalizeLicense = (packageInfo) => {
  const override = licenseOverrides[packageInfo.packageJson.name];
  if (override !== undefined) {
    return override.license;
  }
  const license = packageInfo.packageJson.license;
  if (typeof license === 'string' && license.trim().length > 0) {
    return license.trim();
  }
  if (Array.isArray(packageInfo.packageJson.licenses)) {
    return packageInfo.packageJson.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter((value) => typeof value === 'string' && value.length > 0)
      .join(' OR ');
  }
  return 'UNKNOWN';
};

const renderThirdPartyLicenses = (packages) => {
  const lines = [
    '# Third-Party Licenses',
    '',
    'This file is generated by `scripts/prepare-publish.sh` from runtime packages bundled into the npm package.',
    '',
  ];

  for (const packageInfo of packages) {
    const license = normalizeLicense(packageInfo);
    const override = licenseOverrides[packageInfo.packageJson.name];
    const licenseFile = findLicenseFile(packageInfo.packageDirectory);
    const licenseText =
      override !== undefined
        ? `${override.text}\n\nSource: ${override.source}`
        : licenseFile === null
        ? 'No license file was found in the installed package.'
        : readFileSync(licenseFile, 'utf8').trim();

    lines.push(
      `## ${packageInfo.packageJson.name}@${packageInfo.packageJson.version}`,
      '',
      `License: ${license}`,
      '',
      '```text',
      licenseText,
      '```',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
};

const packages = collectRuntimePackages();
const violations = packages
  .map((packageInfo) => ({
    name: packageInfo.packageJson.name,
    version: packageInfo.packageJson.version,
    license: normalizeLicense(packageInfo),
  }))
  .filter((entry) => deniedLicensePattern.test(entry.license));

if (violations.length > 0) {
  console.error('Disallowed or unknown licenses were found in bundled runtime packages:');
  for (const violation of violations) {
    console.error(`- ${violation.name}@${violation.version}: ${violation.license}`);
  }
  process.exit(1);
}

mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
writeFileSync(
  path.join(rootDir, 'dist', 'THIRD_PARTY_LICENSES.md'),
  renderThirdPartyLicenses(packages),
);

console.log(`Generated dist/THIRD_PARTY_LICENSES.md for ${packages.length} runtime packages.`);
NODE
