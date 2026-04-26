# QA Guideline (Web Application)

## Scope

Behavioral correctness of the application.
Type checking, linting, and other code quality checks are out of scope (handled by gatecheck).

## Dev Server

- Start command: `pnpm dev`
- Port: `http://localhost:33333`
- Health check: `curl -s http://localhost:33333 > /dev/null && echo "OK"`

## E2E Exploratory Testing

Use Playwright CLI for browser-based verification.

```bash
npx -y --package '@playwright/cli@latest' -- playwright-cli ...
```

(referred to as `playwright-cli` below)

### Target URL

Follow project configuration for the URL to access.
If a local dev server is needed, try accessing first (it may already be running). Only start the server yourself if the connection fails.

### Verification Flow

Core loop: `goto` → `snapshot` → (read yml to identify refs) → `click`/`fill` → `snapshot` → ...

```bash
# 1. Launch browser and navigate
playwright-cli open
playwright-cli goto 'http://localhost:3000'

# 2. Take snapshot to get ref IDs (outputs DOM tree with ref IDs to .playwright-cli/*.yml)
playwright-cli snapshot

# 3. Interact using ref IDs from snapshot
playwright-cli click e10          # click
playwright-cli fill e20 'hello'   # text input
playwright-cli select e30 'opt1'  # select dropdown

# 4. Snapshot again after each action to verify state
playwright-cli snapshot

# 5. Check for console errors
playwright-cli console error

# 6. Take screenshots for evidence
playwright-cli screenshot         # full page
playwright-cli screenshot e10     # specific element
```

### Recording (optional)

```bash
playwright-cli video-start
# ... perform actions ...
playwright-cli video-stop   # saves to .playwright-cli/assets/{identifier}.webm
```

### Notes

- Snapshots (yml): `.playwright-cli/`
- Videos: `.playwright-cli/assets/{identifier}.webm`
- Multiple sessions: `-s=<name>`
- Auth persistence: `state-save auth.json` / `state-load auth.json`
- Network mocking: `route '*/api/*'`

## Automated Test Coverage

1. Identify existing tests related to the target code
2. Review test case coverage — pay special attention to error cases, boundary values, and semi-normal scenarios
3. If gaps are found, implement additional tests
4. Run all relevant tests and confirm they pass

## Exploratory Testing Notes

- API server runs separately behind the Vite app, so confirm both ports are up before testing ACP flows.
- To validate the main scenario, create a session, send one prompt, and confirm plan/diff/terminal panes remain stable even when empty.
