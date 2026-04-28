import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { FC } from "react";

import { AppMenuLayout } from "../components/app-menu.tsx";
import { AppToaster } from "../components/app-toaster.tsx";

const RootComponent: FC = () => (
  <>
    <AppMenuLayout>
      <Outlet />
    </AppMenuLayout>
    <AppToaster position="top-right" richColors />
  </>
);

export const Route = createRootRoute({
  component: RootComponent,
});
