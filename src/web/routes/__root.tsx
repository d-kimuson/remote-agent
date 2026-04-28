import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AppMenuLayout } from "../components/app-menu.tsx";

export const Route = createRootRoute({
  component: () => (
    <AppMenuLayout>
      <Outlet />
    </AppMenuLayout>
  ),
});
