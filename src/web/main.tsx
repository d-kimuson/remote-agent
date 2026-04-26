import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClientProviderWrapper } from "./lib/api/QueryClientProviderWrapper";
import { routeTree } from "./routeTree.gen";

import "./styles.css"; // tailwind css style

const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <div>Not Found</div>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <QueryClientProviderWrapper>
      <RouterProvider router={router} />
    </QueryClientProviderWrapper>
  </StrictMode>,
);
