# remote-agent

Run ACP-compatible coding agents from a browser, while the actual agent process stays on your
own machine or server.

`remote-agent` is a small web UI and Node BFF for people who want to keep Codex, Claude Code,
Copilot CLI, Cursor Agent, or pi behind a personal server or VPN, then drive coding sessions from
another browser. The browser never starts an agent process directly. The server owns the ACP
session, streams plans / reasoning / diffs / terminal events back to the UI, and persists the chat
state locally.

## Why remote-agent?

- Use a phone, tablet, or another laptop to control agents running on your workstation or home
  server.
- Keep project working directories and agent credentials on the server side.
- Switch between ACP providers per project.
- Pick provider-returned models and modes without assuming all providers mean the same thing.
- Resume supported provider sessions and import local provider logs where implemented.
- Attach files to the next prompt from the browser.
- Receive browser notifications when an assistant response completes.

## Requirements

- Node.js `>=24`
- pnpm `10.33.2`
- At least one ACP provider command installed and available on `PATH`
- Credentials for the provider you enable, configured exactly as that provider expects

Provider adapters are not bundled with `remote-agent`. Install the provider CLI / ACP adapter you
want to use first, then confirm the command is visible from the shell that starts `remote-agent`.

## Quick Start

```bash
pnpm dlx @kimuson/remote-agent
```

By default the server starts on:

```text
http://localhost:8989
```

Useful environment variables:

```bash
PORT=8989              # HTTP port
RA_DIR=~/.ra           # SQLite database and app state directory
RA_API_KEY=...         # Optional bearer token required for /api/*
RA_ALLOWED_IPS=...     # Optional comma-separated IP allowlist checked via proxy headers
```

Generate an API key with:

```bash
remote-agent generate-api-key
```

For local development from this repository:

```bash
pnpm install
pnpm dev
```

For a production build from this repository:

```bash
pnpm build
node dist/cli.mjs
```

## Basic Usage

1. Start `remote-agent` on the machine that has your projects and provider credentials.
2. Open the web UI in your browser.
3. In the initial setup dialog, enable at least one Provider.
4. Create a Project by selecting a working directory on the server.
5. Choose a Provider, Model, and Mode.
6. Send a prompt.

The server stores app state in SQLite under `RA_DIR` and keeps active ACP provider processes in
the current server process. If the server restarts, stored sessions are listed as inactive and are
started again when you send a message or explicitly load a supported provider session.

## Provider Support

`remote-agent` uses built-in Provider presets and user-defined Custom Providers. A Custom Provider
stores a name and the stdio command used to start that ACP-compatible agent.

| Provider           | Preset ID         | Command used by remote-agent | Model selector    | Mode selector | Load existing sessions | Import local logs                |
| ------------------ | ----------------- | ---------------------------- | ----------------- | ------------- | ---------------------- | -------------------------------- |
| Codex              | `codex`           | `codex-acp`                  | Model / Effort    | Sandbox       | Yes                    | Yes, from `~/.codex/sessions`    |
| Claude Code        | `claude-code`     | `claude-agent-acp`           | Model             | Permission    | Yes                    | Yes, from `~/.claude/projects`   |
| GitHub Copilot CLI | `copilot-cli`     | `copilot --acp --stdio`      | Model             | Mode          | No                     | No                               |
| pi-coding-agent    | `pi-coding-agent` | `pi-acp`                     | Provider / Model  | Thinking      | Yes                    | Yes, from `~/.pi/agent/sessions` |
| Cursor CLI         | `cursor-cli`      | `agent acp`                  | Model / Reasoning | Mode          | No                     | No                               |
| OpenCode           | `opencode`        | `opencode acp`               | Model             | Mode          | No                     | No                               |
| Custom Provider    | generated         | User-configured              | Model             | Mode          | No                     | No                               |

### What "Model" and "Mode" Mean

ACP providers do not use `models`, `modes`, and `configOptions` consistently. `remote-agent` keeps
provider values opaque and sends the selected IDs back to the provider unchanged.

- Codex returns model IDs such as `gpt-5.5/low`; the effort is part of the model ID returned by
  the provider. Modes are sandbox choices such as read-only / auto / full-access.
- Claude Code returns clean model IDs such as `default`, `sonnet`, `haiku`, and `opus`. Modes are
  permission policies.
- Copilot CLI returns clean model IDs. Modes are agent behavior choices such as Agent / Plan /
  Autopilot. Reasoning effort is exposed via provider config options, not as a first-class
  `remote-agent` selector yet.
- pi-coding-agent uses provider/model IDs such as `openai-codex/gpt-5.5`. Modes are thinking
  levels, so `/` in the model ID must not be interpreted as an effort separator.
- Cursor CLI uses `agent acp`. Some model IDs include bracketed attributes such as context,
  reasoning, and fast mode. `remote-agent` treats those as provider-owned IDs.
- OpenCode uses `opencode acp`. Custom Providers use the same generic ACP handling but each entry
  stores its own name and command, for example name `hoge-agent` with command
  `npx hoge-agent --acp`.

Model and mode catalogs are refreshed by starting an ephemeral ACP session and reading the
provider's `initSession` response. If a provider does not return models or modes directly,
`remote-agent` can read model/mode `configOptions` for catalog display, but generic provider config
editing is not implemented yet.

### Session Loading

The UI can discover and load existing sessions only for providers that are enabled in the server:

- Codex
- Claude Code
- pi-coding-agent

Copilot CLI, Cursor CLI, OpenCode, and Custom Providers can start new sessions, but
existing-session discovery/loading is not enabled for them in the current implementation.

## Provider Installation Notes

Install the commands you plan to enable:

```bash
# examples only; use the provider's official installation instructions when they differ
npm install -g @zed-industries/codex-acp
npm install -g @agentclientprotocol/claude-agent-acp
npm install -g pi-acp
```

For Copilot CLI, Cursor CLI, and OpenCode, install their official CLIs and make sure these commands work:

```bash
copilot --acp --stdio
agent acp
opencode acp
```

For Custom Providers, add one entry per agent command from Settings. Enter a display name such as
`hoge-agent` and a stdio ACP command such as `npx hoge-agent --acp`. If you need another agent,
choose one from the ACP agent list at https://agentclientprotocol.com/get-started/agents or
implement an ACP-compatible agent server.

`remote-agent` passes a narrow environment allowlist to agent processes, including provider
credential variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`,
`CURSOR_API_KEY`, `GEMINI_API_KEY`, and `PI_API_KEY`.

## Claude Code Subscription Warning

Do not use Claude Code through this project with a Claude subscription account where that use is
not allowed by Anthropic's Claude Code terms. `remote-agent` only launches an authenticated ACP
provider process; it cannot determine whether your account, plan, region, or intended use is
permitted. If the provider authenticates, it may technically run, but this project does not make
prohibited usage allowed and the maintainers take no responsibility for that use.

Use API-key or provider-supported authentication only when it complies with the provider's current
terms.

## Security Notes

`remote-agent` is designed for trusted networks such as your own machine, a private LAN, or a VPN.
It can start coding agents inside server-side working directories and those agents may edit files
or run commands depending on the selected provider and mode.

- Do not expose it directly to the public internet.
- Put it behind VPN, SSH tunneling, or your own authenticated reverse proxy.
- Set `RA_API_KEY` when sharing beyond localhost; clients must send
  `Authorization: Bearer <RA_API_KEY>`.
- Set `RA_ALLOWED_IPS` when your reverse proxy forwards `X-Forwarded-For` / `X-Real-IP` and you
  want an additional IP allowlist.
- Treat browser access as access to the server-side projects and enabled provider credentials.
- Review provider permission prompts carefully, especially with permissive sandbox / permission
  modes.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

The API is served by Hono, the web UI is React + TanStack Query / Router, and ACP provider
processes are managed on the Node side through `@mcpc-tech/acp-ai-provider`.
