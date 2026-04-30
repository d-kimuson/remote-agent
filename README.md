# remote-agent

Control coding agents from another device while the actual agent processes stay on your own
machine or server.

`remote-agent` is a browser/PWA client and Node server for operating ACP-compatible coding agents
such as Codex, Claude Code, GitHub Copilot CLI, pi-coding-agent, Cursor CLI, OpenCode, and custom
ACP providers. Start the server on the machine that has your repositories and agent credentials,
then connect from a phone, tablet, laptop, or another desktop browser to start sessions, resume
existing work, review tool output, and approve provider permission requests.

The browser never starts agent processes directly. The server owns the ACP sessions, streams
assistant output and tool activity to the UI, persists app state locally, and serves the web client.

## Quick Start

`remote-agent` is designed for trusted networks. The recommended setup is to expose it only through
Tailscale, another VPN, SSH tunneling, or a private reverse proxy.

Useful Tailscale references:

- https://tailscale.com/docs/how-to/quickstart
- https://tailscale.com/docs/how-to/set-up-https-certificates

After your secure network path is ready, start the server on the machine that has your projects and
provider credentials:

```bash
npx -y @kimuson/remote-agent@latest
```

By default, `remote-agent` starts both the API server and the browser/PWA client on:

```text
http://localhost:8989
```

Open that URL directly on the server, or open the Tailscale / reverse-proxy URL from another
device.

## Requirements

- Node.js `>=24`
- At least one ACP provider command installed and available on `PATH`
- Credentials for the provider you enable, configured exactly as that provider expects

Provider adapters are not bundled with `remote-agent`. Install the provider CLI or ACP adapter you
want to use first, then confirm the command is visible from the shell that starts `remote-agent`.

## Features

- Multi-provider support: built-in presets for Codex, Claude Code, GitHub Copilot CLI,
  pi-coding-agent, Cursor CLI, and OpenCode, plus custom ACP provider commands.
- Browser/PWA client: use the app from any modern browser, or install it as a PWA for an
  app-like experience on supported devices.
- Real-time assistant output: stream agent responses, plans, reasoning, and progress as they
  happen.
- Tool viewers: inspect shell commands, file reads, writes, edits, and diffs with UI views built
  for coding-agent workflows.
- Permission approvals: respond to provider tool-approval requests from the web client.
- Notifications: receive task-completion and approval-request notifications, including device
  notifications when the PWA is installed and notification permission is granted.
- Completion sound: play an audible notification when an agent task finishes.
- Efficient prompt input: use provider command completion, file-path completion, prompt
  attachments, and voice input.
- Code review workflow: open a GitHub-like diff viewer, comment on lines, and turn review comments
  into follow-up instructions for the agent.
- Git worktree support: start sessions in worktrees, preserve subdirectory paths in monorepos, and
  use `.worktreeinclude` plus optional setup scripts.
- Routines: schedule agent runs with cron expressions or specific datetimes.
- Access controls: require an API key and optionally restrict requests by forwarded client IP.

## Basic Usage

1. Start `remote-agent` on the machine that has your repositories and provider credentials.
2. Open the web UI in a browser.
3. In the initial setup dialog, enable at least one provider.
4. Create a project by selecting a working directory on the server.
5. Choose a provider, model, and mode.
6. Send a prompt.

The server stores app state in SQLite under `RA_DIR` and keeps active ACP provider processes in the
current server process. If the server restarts, stored sessions are listed as inactive and can be
started again when you send a message or explicitly load a supported provider session.

## Configuration

`remote-agent` is configured with CLI flags and environment variables.

| Environment variable | CLI flag        | Default | Description                                                                 |
| -------------------- | --------------- | ------- | --------------------------------------------------------------------------- |
| `PORT`               | -               | `8989`  | HTTP port for the `remote-agent` server.                                    |
| `RA_DIR`             | -               | `~/.ra` | Directory for the SQLite database and app state.                            |
| `RA_API_KEY`         | -               | -       | Optional bearer token required for `/api/*` requests.                       |
| `RA_ALLOWED_IPS`     | -               | -       | Optional comma-separated IP allowlist checked via proxy headers.            |
| -                    | `--server-only` | `false` | Start only the API server without serving the bundled browser client build. |

Generate an API key with:

```bash
remote-agent generate-api-key
```

Example:

```bash
PORT=8989 \
RA_DIR=~/.ra \
RA_API_KEY="$(remote-agent generate-api-key)" \
npx -y @kimuson/remote-agent@latest
```

## Provider Support

`remote-agent` uses built-in provider presets and user-defined custom providers. A custom provider
stores a display name and the stdio command used to start an ACP-compatible agent.

| Provider           | Preset ID         | Command used by remote-agent | Model selector    | Mode selector | Load existing sessions | Import local logs                |
| ------------------ | ----------------- | ---------------------------- | ----------------- | ------------- | ---------------------- | -------------------------------- |
| Codex              | `codex`           | `codex-acp`                  | Model / Effort    | Sandbox       | Yes                    | Yes, from `~/.codex/sessions`    |
| Claude Code        | `claude-code`     | `claude-agent-acp`           | Model             | Permission    | Yes                    | Yes, from `~/.claude/projects`   |
| GitHub Copilot CLI | `copilot-cli`     | `copilot --acp --stdio`      | Model             | Mode          | No                     | No                               |
| pi-coding-agent    | `pi-coding-agent` | `pi-acp`                     | Provider / Model  | Thinking      | Yes                    | Yes, from `~/.pi/agent/sessions` |
| Cursor CLI         | `cursor-cli`      | `agent acp`                  | Model / Reasoning | Mode          | No                     | No                               |
| OpenCode           | `opencode`        | `opencode acp`               | Model             | Mode          | No                     | No                               |
| Custom Provider    | generated         | User-configured              | Model             | Mode          | No                     | No                               |

### Provider Installation Notes

Install the commands you plan to enable:

```bash
# Examples only. Use the provider's official installation instructions when they differ.
npm install -g @zed-industries/codex-acp
npm install -g @agentclientprotocol/claude-agent-acp
npm install -g pi-acp
```

For GitHub Copilot CLI, Cursor CLI, and OpenCode, install their official CLIs and make sure these
commands work:

```bash
copilot --acp --stdio
agent acp
opencode acp
```

For custom providers, add one entry per agent command from Settings. Enter a display name such as
`hoge-agent` and a stdio ACP command such as `npx hoge-agent --acp`. You can choose another ACP
agent from https://agentclientprotocol.com/get-started/agents or implement an ACP-compatible agent
server.

`remote-agent` passes a narrow environment allowlist to agent processes, including provider
credential variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`,
`CURSOR_API_KEY`, `GEMINI_API_KEY`, and `PI_API_KEY`.

### Model and Mode Handling

ACP providers do not use `models`, `modes`, and `configOptions` consistently. `remote-agent` keeps
provider values opaque and sends the selected IDs back to the provider unchanged.

- Codex returns model IDs such as `gpt-5.5/low`; the effort is part of the model ID returned by the
  provider. Modes are sandbox choices such as read-only, auto, and full-access.
- Claude Code returns model IDs such as `default`, `sonnet`, `haiku`, and `opus`. Modes are
  permission policies.
- GitHub Copilot CLI returns model IDs. Modes are behavior choices such as Agent, Plan, and
  Autopilot. Reasoning effort is exposed via provider config options.
- pi-coding-agent uses provider/model IDs such as `openai-codex/gpt-5.5`. Modes are thinking
  levels, so `/` in the model ID is treated as part of the provider-owned ID.
- Cursor CLI uses `agent acp`. Some model IDs include bracketed attributes such as context,
  reasoning, and fast mode.
- OpenCode uses `opencode acp`. Custom providers use the same generic ACP handling but store their
  own name and command.

Model and mode catalogs are refreshed by starting an ephemeral ACP session and reading the
provider's `initSession` response. If a provider does not return models or modes directly,
`remote-agent` can read model/mode `configOptions` for catalog display.

## Security Notes

`remote-agent` can start coding agents inside server-side working directories, and those agents may
edit files or run commands depending on the selected provider and mode.

- Do not expose `remote-agent` directly to the public internet.
- Put it behind Tailscale, another VPN, SSH tunneling, or your own authenticated reverse proxy.
- Set `RA_API_KEY` when sharing beyond localhost; clients must send
  `Authorization: Bearer <RA_API_KEY>`.
- Set `RA_ALLOWED_IPS` when your reverse proxy forwards `X-Forwarded-For` or `X-Real-IP` and you
  want an additional IP allowlist.
- Treat browser access as access to the server-side projects and enabled provider credentials.
- Review provider permission prompts carefully, especially with permissive sandbox or permission
  modes.

## Claude Code Subscription Warning

Do not use Claude Code through this project with a Claude subscription account where that use is not
allowed by Anthropic's Claude Code terms. `remote-agent` only launches an authenticated ACP provider
process; it cannot determine whether your account, plan, region, or intended use is permitted.

Use API-key or provider-supported authentication only when it complies with the provider's current
terms.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

The API is served by Hono, the web UI is React + TanStack Query / Router, and ACP provider
processes are managed on the Node side through `@mcpc-tech/acp-ai-provider`.
