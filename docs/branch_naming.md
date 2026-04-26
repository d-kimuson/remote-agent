# Branch Naming Convention

## Format

```
<type>/<short-description>
```

## Types

| Type       | When to use               |
| ---------- | ------------------------- |
| `feature`  | New feature or capability |
| `fix`      | Bug fix                   |
| `hotfix`   | Urgent production fix     |
| `chore`    | Tooling, CI, dependencies |
| `refactor` | Code restructuring        |

## Rules

- Use lowercase with hyphens as word separators
- Keep descriptions short (2-4 words)
- Include issue number when applicable: `feature/123-add-auth`

## Examples

Good:

- `feature/add-user-auth`
- `fix/race-condition-queue`
- `chore/update-dependencies`
- `feature/123-payment-flow`

Bad:

- `Feature/AddUserAuth` (uppercase, no hyphens)
- `fix` (no description)
- `my-branch` (no type prefix)
