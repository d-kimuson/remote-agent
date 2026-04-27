import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { SettingsPage } from "../app/settings/settings-page.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";

const SettingsRoute = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <Link className={cn(buttonVariants({ variant: "outline" }), "w-fit")} to="/projects">
            <ArrowLeft className="size-4" />
            Projects
          </Link>
          <div className="space-y-2">
            <Badge variant="secondary">ACP Playground</Badge>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
          </div>
        </header>
        <SettingsPage />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});
