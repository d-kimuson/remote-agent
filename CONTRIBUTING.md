# Contributing

This document is for people developing `remote-agent` itself. User-facing setup belongs in the
README.

## Development Setup

Use the repository dev environment when available:

```bash
direnv allow
pnpm install
```

The app is split into a Node API/BFF and a browser SPA. Start both in development mode with:

```bash
pnpm dev
```

Useful commands:

```bash
pnpm fix
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`lefthook` runs formatting, lint fixes, and staged secret scanning before commits. The secret scan
uses `gitleaks`, which is provided by the Nix dev shell.

## Generated Files

Regenerate checked-in generated artifacts with:

```bash
pnpm generate
```

This updates files such as the database documentation and OpenAPI document when the corresponding
source definitions change.

## Release Checks

The release script performs the publish-time validation flow:

```bash
pnpm release
```

It validates the package, checks bundled dependency licenses, updates generated artifacts, creates
the release commit/tag, and pushes the release refs.

## Project References

Before making larger changes, read the relevant project references:

- `docs/coding-guideline.md`
- `docs/coding-process.md`
- `docs/commit_message.md`
- `docs/branch_naming.md`
- `docs/e2e-exploratory-testing-process.md`
