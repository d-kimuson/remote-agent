# Coding Process

## Recommended Coding Process

This project is designed with the philosophy of achieving both rapid feedback and code quality maintenance (passing checks = nearly guaranteed runtime correctness) by leveraging:

- Strict typing with ADT
- Constraints for maintaining code quality configured in Lint as much as possible
- Dependency injection and effective testing

For development, implement with TDD development style.

For checks, run `pnpm gatecheck check` to execute all checks against the diff at once, then proceed with implementation in a loop of problem detection and fixing with gatecheck.

## Definition of Done

On task completion, verify ALL of the following pass in addition to task-specific ACs.

```bash
pnpm gatecheck check
pnpm check:i18n
pnpm build
pnpm test
```

If ACP-compatible local agents are available, manually verify at least one session can be created from the UI and one prompt can be completed.

## Notable Commands

| Command           | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `pnpm build`      | Build for production                       |
| `pnpm check:i18n` | Verify i18n resource keys and primary text |
| `pnpm dev`        | Start Hono and Vite in parallel            |
| `pnpm test`       | Run unit and browser tests                 |
| `pnpm typecheck`  | Run TypeScript native preview type check   |
