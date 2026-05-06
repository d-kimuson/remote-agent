import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { Suspense, type FC } from 'react';

import { InitialSetupDialog } from '../app/onboarding/initial-setup-dialog.tsx';
import { AppMenuLayout } from '../components/app-menu.tsx';
import { AppToaster } from '../components/app-toaster.tsx';

const RootComponent: FC = () => {
  const location = useLocation();
  if (location.pathname === '/setup-mobile-crt') {
    return (
      <>
        <Outlet />
        <AppToaster position="top-right" richColors />
      </>
    );
  }

  return (
    <>
      <AppMenuLayout>
        <Outlet />
      </AppMenuLayout>
      <Suspense fallback={null}>
        <InitialSetupDialog />
      </Suspense>
      <AppToaster position="top-right" richColors />
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
