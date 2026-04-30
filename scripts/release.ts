import inquirer from 'inquirer';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (command: string, args: string[] = []): string =>
  execFileSync(command, args, { cwd: root, encoding: 'utf-8' }).trim();

const runOrFail = (command: string, args: string[], label: string): void => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`\nx ${label} failed. Aborting release.`);
    process.exit(1);
  }
};

const readGitConfig = (key: string): string => {
  try {
    return run('git', ['config', '--get', key]).toLowerCase();
  } catch {
    return '';
  }
};

const pkgPath = path.join(root, 'package.json');
const parsedPackageJson: unknown = JSON.parse(readFileSync(pkgPath, 'utf-8'));

if (
  typeof parsedPackageJson !== 'object' ||
  parsedPackageJson === null ||
  Array.isArray(parsedPackageJson) ||
  !('version' in parsedPackageJson) ||
  typeof parsedPackageJson.version !== 'string'
) {
  console.error('x version field not found in package.json');
  process.exit(1);
}

const pkg = parsedPackageJson;
const current = parsedPackageJson.version;

console.log(`Current version: ${current}\n`);

const status = run('git', ['status', '--porcelain']);
if (status !== '') {
  console.error('x Working tree is not clean. Commit or stash changes first.');
  process.exit(1);
}

const gpgFormat = readGitConfig('gpg.format');
const commitSign = readGitConfig('commit.gpgsign');
const tagSign = readGitConfig('tag.gpgsign');

if (gpgFormat !== 'ssh' || commitSign !== 'true' || tagSign !== 'true') {
  console.error('x Git signing is not configured. Required:');
  console.error('  git config --global gpg.format ssh');
  console.error('  git config --global commit.gpgsign true');
  console.error('  git config --global tag.gpgsign true');
  process.exit(1);
}

const parseVersion = (
  v: string,
): { major: number; minor: number; patch: number; pre: string | undefined } => {
  const [base, pre] = v.split('-');
  const segments = (base ?? '').split('.').map(Number);
  return {
    major: segments[0] ?? 0,
    minor: segments[1] ?? 0,
    patch: segments[2] ?? 0,
    pre,
  };
};

const bumpChoices = (v: string): { name: string; value: string }[] => {
  const { major, minor, patch, pre } = parseVersion(v);

  if (pre !== undefined) {
    const preParts = pre.split('.');
    const preTag = preParts[0] ?? 'beta';
    const preNum = Number(preParts[1] ?? 0);
    const nextPre = `${major}.${minor}.${patch}-${preTag}.${preNum + 1}`;
    return [
      { name: `${preTag} (${nextPre})`, value: nextPre },
      {
        name: `patch (${major}.${minor}.${patch})`,
        value: `${major}.${minor}.${patch}`,
      },
      {
        name: `minor (${major}.${minor + 1}.0)`,
        value: `${major}.${minor + 1}.0`,
      },
      { name: `major (${major + 1}.0.0)`, value: `${major + 1}.0.0` },
    ];
  }

  const nextPatch = `${major}.${minor}.${patch + 1}`;
  return [
    { name: `patch (${nextPatch})`, value: nextPatch },
    {
      name: `minor (${major}.${minor + 1}.0)`,
      value: `${major}.${minor + 1}.0`,
    },
    { name: `major (${major + 1}.0.0)`, value: `${major + 1}.0.0` },
    { name: `beta (${nextPatch}-beta.0)`, value: `${nextPatch}-beta.0` },
  ];
};

const { version } = await inquirer.prompt<{ version: string }>([
  {
    type: 'rawlist',
    name: 'version',
    message: 'Select release version:',
    choices: [...bumpChoices(current), { name: 'Custom', value: 'custom' }],
  },
]);

const nextVersion =
  version === 'custom'
    ? (
        await inquirer.prompt<{ custom: string }>([
          { type: 'input', name: 'custom', message: 'Enter version:' },
        ])
      ).custom
    : version;

const tag = `v${nextVersion}`;

const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
  {
    type: 'confirm',
    name: 'confirmed',
    message: `Release ${tag}? This will commit, tag (signed), and push.`,
    default: false,
  },
]);

if (!confirmed) {
  console.log('Aborted.');
  process.exit(0);
}

console.log('\nRunning checks...\n');
runOrFail('pnpm', ['audit', '--audit-level', 'low'], 'Audit');
runOrFail('pnpm', ['build'], 'Build');
runOrFail('pnpm', ['check:bundled-licenses'], 'Bundled license check');
runOrFail('pnpm', ['gatecheck', 'check'], 'Gatecheck');
runOrFail('pnpm', ['test'], 'Test');
runOrFail('pnpm', ['smoke:pack'], 'Pack smoke test');
console.log('\nAll checks passed.\n');

const nextPkg = { ...pkg, version: nextVersion };
writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);
console.log(`\nUpdated package.json to ${nextVersion}`);

run('git', ['add', 'package.json']);
run('git', ['add', 'docs/openapi.json']);
runOrFail('git', ['commit', '-S', '-m', `chore: release ${tag}`], 'Signed commit');
runOrFail('git', ['tag', '-s', tag, '-m', tag], 'Signed tag');

console.log(`\nCreated signed commit and tag ${tag}`);

runOrFail('git', ['push'], 'Push commits');
runOrFail('git', ['push', '--tags'], 'Push tags');

console.log(`\nReleased ${tag} - GitHub Actions will publish to npm.`);
