import type { AgentPreset } from "@/shared/acp";

export const agentPresets = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "ACP adapter command installed locally as claude-code-acp.",
    command: "claude-code-acp",
    args: [],
  },
  {
    id: "codex-cli",
    label: "Codex CLI",
    description: "Official Codex ACP adapter via npx @zed-industries/codex-acp.",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    description: "Gemini CLI experimental ACP mode.",
    command: "gemini",
    args: ["--experimental-acp"],
  },
  {
    id: "custom",
    label: "Custom Command",
    description: "Provide any ACP-compatible command and arguments manually.",
    command: "",
    args: [],
  },
] as const satisfies readonly AgentPreset[];
