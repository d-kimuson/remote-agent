import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { resolveMigrationsFolder } from './sqlite.ts';

describe('resolveMigrationsFolder', () => {
  test('uses source drizzle directory in development runtime', () => {
    const moduleDirectory = path.join('/workspace', 'src', 'server', 'db');

    expect(resolveMigrationsFolder('dev', moduleDirectory)).toBe(
      path.join('/workspace', 'drizzle'),
    );
  });

  test('uses dist directory in production runtime', () => {
    const moduleDirectory = path.join('/workspace', 'dist');

    expect(resolveMigrationsFolder('production', moduleDirectory)).toBe(moduleDirectory);
  });
});
