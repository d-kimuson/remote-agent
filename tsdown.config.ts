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
  clean: false,
  sourcemap: true,
  banner: '#!/usr/bin/env node',
  deps: {
    onlyBundle: false,
  },
});
