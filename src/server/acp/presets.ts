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
    id: "codex",
    label: "Codex",
    description: "Official Codex ACP adapter via npx @zed-industries/codex-acp.",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
  },
  {
    id: "pi",
    label: "Pi",
    description: "Pi coding agent ACP command installed locally as pi.",
    command: "pi",
    args: ["--acp"],
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
