import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Suspense, type FC } from 'react';

import { ApiAuthGate } from '../app/auth/api-auth-gate.tsx';
import { InitialSetupDialog } from '../app/onboarding/initial-setup-dialog.tsx';
import { AppMenuLayout } from '../components/app-menu.tsx';
import { AppToaster } from '../components/app-toaster.tsx';

const RootComponent: FC = () => (
  <ApiAuthGate>
    <AppMenuLayout>
      <Outlet />
    </AppMenuLayout>
    <Suspense fallback={null}>
      <InitialSetupDialog />
    </Suspense>
    <AppToaster position="top-right" richColors />
  </ApiAuthGate>
);

export const Route = createRootRoute({
  component: RootComponent,
});
