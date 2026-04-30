# remote-agent

<!-- TODO: Logo -->

<p align="center">
  <a href="https://github.com/d-kimuson/remote-agent/actions/workflows/ci.yaml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/d-kimuson/remote-agent/ci.yaml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/d-kimuson/remote-agent/releases"><img src="https://img.shields.io/github/v/release/d-kimuson/remote-agent?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

> `remote-agent` is a tool for remotely operating coding agents such as Codex, Claude Code, Cursor
> CLI, and other agent CLIs from a single web interface. Run the `remote-agent` server on your own
> machine, then connect from a client device such as iOS, Android, another desktop browser, or an
> installed PWA to start sessions, resume work, approve tool requests, and interact with your
> agents.

## Installation

### Quick Start (Tailscale, Recommended)

`remote-agent` needs a secure path between the server and client. Tailscale is the recommended
setup.

- https://tailscale.com/docs/how-to/quickstart
- https://tailscale.com/docs/how-to/set-up-https-certificates

Make sure the agent you want to use is already available on the server machine, then start the
`remote-agent` server:

```bash
npx -y @kimuson/remote-agent@latest
```

By default, the server starts both the client SPA/PWA and the API server. Open the URL assigned by
Tailscale to start using `remote-agent` from another device.

<!-- FIXME: Add other usage patterns -->

## Features

- Multi-provider support: built-in providers for Codex, Claude Code, GitHub Copilot CLI,
  pi-coding-agent, Cursor CLI, and OpenCode. Any ACP-compatible agent can also be added as a custom
  provider.
- Browser/PWA client: the client is served as an SPA and works through a browser on any OS. Install
  it as a PWA for an app-like experience.
- Real-time preview: stream agent output as it is produced.
- Visual tool viewers: inspect common tool calls such as Bash, Read, Write, and Edit with terminal,
  file, and diff viewers.
- Tool approval: approve or reject tool-approval requests from supported agents.
- Notifications: receive task-completion and approval-request notifications. When installed as a
  PWA, device notifications are available through the service worker.
- Completion sound: play an audible notification when an agent task finishes.
- Efficient prompt input: use agent command completion, file-path completion, and voice input.
- Code review: open a GitHub-like diff viewer, leave line comments, and seamlessly turn them into
  review instructions for the agent.
- Git worktree support: start sessions in a selected worktree. Supports `.worktreeinclude`,
  optional setup scripts, and preserving subpaths when starting from a subdirectory in a monorepo.
- Routines: run agents on cron schedules or at a specified datetime.
- Authentication: supports API key authentication and IP address restrictions.

## Configuration

`remote-agent` is configured with CLI flags and environment variables.

| Environment variable | CLI flag        | Default | Description                                                                 |
| -------------------- | --------------- | ------- | --------------------------------------------------------------------------- |
| `PORT`               | -               | `8989`  | HTTP port for the `remote-agent` server.                                    |
| `RA_DIR`             | -               | `~/.ra` | Directory for the SQLite database and app state.                            |
| `RA_API_KEY`         | -               | -       | Bearer token required for `/api/*` requests. If unset, API key auth is off. |
| `RA_ALLOWED_IPS`     | -               | -       | Comma-separated IP allowlist checked via `X-Forwarded-For` / `X-Real-IP`.   |
| -                    | `--server-only` | `false` | Start only the API server without serving the client build.                 |
