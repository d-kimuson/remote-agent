import '@fontsource-variable/geist';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { QueryClientProviderWrapper } from './lib/api/QueryClientProviderWrapper';
import './lib/i18n/i18n.ts';
import { LanguageSync } from './lib/i18n/language-sync.tsx';
import { ThemeProvider } from './lib/theme.tsx';
import { registerServiceWorker } from './pwa/register-service-worker.ts';
import { routeTree } from './routeTree.gen';
import './styles.css'; // tailwind css style

registerServiceWorker();

const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <div>Not Found</div>,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProviderWrapper>
        <Suspense fallback={null}>
          <LanguageSync />
        </Suspense>
        <RouterProvider router={router} />
      </QueryClientProviderWrapper>
    </ThemeProvider>
  </StrictMode>,
);
