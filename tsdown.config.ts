import { defineConfig } from 'tsdown';

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
});
