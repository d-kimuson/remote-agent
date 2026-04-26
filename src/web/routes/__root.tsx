import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <main className="min-h-screen">
      <Outlet />
    </main>
  ),
});
