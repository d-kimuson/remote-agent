# Commit Message Convention

Based on [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
<type>(<scope>): <description>

[optional body]
```

## Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or capability                               |
| `fix`      | Bug fix                                                 |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore`    | Build process, tooling, dependencies, CI changes        |
| `docs`     | Documentation only                                      |
| `test`     | Adding or updating tests                                |
| `perf`     | Performance improvement                                 |

## Scope

Optional. Use the module, package, or feature area name.

- Monorepo: package name (e.g. `feat(api): ...`, `fix(web): ...`)
- Single package: feature area (e.g. `feat(auth): ...`, `fix(db): ...`)

## Rules

- Description: imperative mood, lowercase start, no period at end
- Language: English
- Keep the first line under 72 characters
- Use body for "why", not "what" (the diff shows "what")

## Examples

Good:

- `feat(api): add user authentication endpoint`
- `fix: resolve race condition in queue processing`
- `chore: update dependencies`
- `refactor(auth): extract token validation to pure function`

Bad:

- `Fixed bug` (no type, vague)
- `feat: Add new feature for the user authentication system` (too long, capitalized)
- `update` (no type, no description)
