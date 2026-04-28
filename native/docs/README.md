# ACP Playground Native

This directory contains the GPUI Mobile native shell for ACP Playground.

The native app intentionally talks to the existing Hono BFF instead of starting
ACP-compatible agents on-device. Agent processes, session state, SQLite, and SSE
broadcasting stay in the Node server.

## API Client

Rust DTOs are generated from `docs/tmp/openapi.json`.

```sh
pnpm native:api:generate
```

`native/src/api/client.rs` is the hand-written boundary around those generated
types. JSON endpoints are typed; multipart attachment upload and SSE streaming
remain adapter work because the current OpenAPI file does not fully describe
their payloads.

## Development

Enter the Nix shell first so Rust and Android native tooling are available:

```sh
nix develop
pnpm native:check
pnpm native:check:android
```

iOS builds still require Xcode on macOS. The Nix shell provides Rust, Android
SDK/NDK, `cargo-ndk`, and the Rust target standard libraries needed for Android
checks.
