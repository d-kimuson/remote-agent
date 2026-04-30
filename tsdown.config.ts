import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsdown';

const nodeModulesSegment = '/node_modules/';

const parsePackageSpecifier = (id: string): { name: string; packageDirectory: string } | null => {
  const slashed = id.replaceAll(path.sep, '/');
  const nodeModulesIndex = slashed.lastIndexOf(nodeModulesSegment);
  if (nodeModulesIndex === -1) {
    return null;
  }

  const afterNodeModules = slashed.slice(nodeModulesIndex + nodeModulesSegment.length);
  const [first, second] = afterNodeModules.split('/');
  if (first === undefined) {
    return null;
  }

  const name = first.startsWith('@') && second !== undefined ? `${first}/${second}` : first;
  return {
    name,
    packageDirectory: slashed.slice(0, nodeModulesIndex + nodeModulesSegment.length + name.length),
  };
};

const readPackageVersion = (packageDirectory: string): string => {
  const packageJson: unknown = JSON.parse(
    readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    Array.isArray(packageJson) ||
    !('version' in packageJson) ||
    typeof packageJson.version !== 'string'
  ) {
    throw new Error(`Invalid package metadata: ${packageDirectory}`);
  }
  return packageJson.version;
};

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  outDir: 'dist',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  dts: false,
  clean: true,
  sourcemap: false,
  banner: '#!/usr/bin/env node',
  copy: [{ from: 'drizzle/migrations', to: 'dist' }],
  deps: {
    onlyBundle: false,
  },
  plugins: [
    {
      name: 'remote-agent:bundled-package-metadata',
      generateBundle(_, bundle) {
        const packages = new Map<
          string,
          { name: string; version: string; packageDirectory: string }
        >();

        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') {
            continue;
          }

          for (const moduleId of chunk.moduleIds) {
            const parsed = parsePackageSpecifier(moduleId);
            if (parsed === null) {
              continue;
            }
            const version = readPackageVersion(parsed.packageDirectory);
            packages.set(`${parsed.name}@${version}`, { ...parsed, version });
          }
        }

        mkdirSync('.local', { recursive: true });
        writeFileSync(
          '.local/tsdown-bundled-packages.json',
          `${JSON.stringify(
            [...packages.values()].sort((left, right) => left.name.localeCompare(right.name)),
            null,
            2,
          )}\n`,
        );
      },
    },
  ],
});
