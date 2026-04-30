import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandboxDirectory = mkdtempSync(path.join(tmpdir(), 'remote-agent-pack-'));

try {
  execFileSync('npm', ['pack', '--pack-destination', sandboxDirectory, '--ignore-scripts'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  const tarballs = readdirSync(sandboxDirectory)
    .filter((entry) => entry.endsWith('.tgz'))
    .sort();
  const tarball = tarballs[0];

  if (tarball === undefined) {
    throw new Error('npm pack did not create a tarball');
  }

  execFileSync('tar', ['-xzf', path.join(sandboxDirectory, tarball), '-C', sandboxDirectory], {
    stdio: 'inherit',
  });

  const packageDirectory = path.join(sandboxDirectory, 'package');
  const requiredFiles = [
    'dist/cli.mjs',
    'docs/openapi.json',
    'dist/migrations/20260428141939_fat_tenebrous/migration.sql',
    'dist/migrations/20260428141939_fat_tenebrous/snapshot.json',
  ];

  for (const requiredFile of requiredFiles) {
    const filePath = path.join(packageDirectory, requiredFile);
    if (!existsSync(filePath)) {
      throw new Error(`Packed package is missing ${requiredFile}`);
    }
  }

  execFileSync(process.execPath, [path.join(packageDirectory, 'dist/cli.mjs'), '--help'], {
    env: {
      ...process.env,
      RA_DIR: path.join(sandboxDirectory, 'ra-dir'),
      RA_RUNTIME: 'production',
    },
    stdio: 'inherit',
  });
} finally {
  rmSync(sandboxDirectory, { recursive: true, force: true });
}
