import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "../app/settings/settings-page.tsx";

const SettingsRoute = () => {
  return (
    <div className="app-page">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        </header>
        <SettingsPage />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});
