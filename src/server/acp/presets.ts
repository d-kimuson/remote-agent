import type { AgentPreset } from "@/shared/acp";

export const agentPresets = [
  {
    id: "codex",
    label: "Codex",
    description: "Official Codex ACP adapter via npx @zed-industries/codex-acp.",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
  },
] as const satisfies readonly AgentPreset[];
