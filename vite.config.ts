import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pwaManifest = {
  name: 'ACP Playground',
  short_name: 'ACP Playground',
  description: 'ACP を使って任意の Agent を SPA から試すための playground',
  theme_color: '#0f172a',
  background_color: '#020617',
  display: 'standalone',
  lang: 'ja',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: '/pwa-192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/pwa-512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/pwa-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
} as const;

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/web/routes',
      generatedRouteTree: './src/web/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/web',
      filename: 'sw.ts',
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: [
        'apple-touch-icon.png',
        'badge-96.png',
        'favicon.svg',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
      ],
      manifest: pwaManifest,
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        globPatterns: ['**/*.{css,html,js,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 33333,
    proxy: {
      '/api': process.env['SERVER_BASE_URL'] ?? '//acp-hono.localhost',
    },
    watch: {
      ignored: ['**/routeTree.gen.ts'],
    },
  },
});
