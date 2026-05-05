# Release Note Guideline

This guideline is for agents reviewing and rewriting GitHub Release notes for remote-agent.

## Background

Release notes are initially generated automatically from commit logs. Treat them as a draft, not as the final source of truth.

Because they come from commits:

- Conventional Commit types such as `feat`, `fix`, and `perf` may not match the actual user-facing release-note category.
- Internal implementation details may be included even when they are not useful to remote-agent users.
- Commit-message phrasing may be too terse, too technical, or written from a developer workflow perspective.
- Intermediate commits may appear as fixes even though the feature they fix has never been released before.

## Review Perspective

Review the draft from the perspective of the released remote-agent software, not from the perspective of the repository commit history.

Ask:

- What changed for users or operators of remote-agent?
- Is this an actual product feature, bug fix, performance improvement, or maintenance-only change?
- Would this entry help someone decide whether to upgrade or understand what changed?

## Categorization Rules

### Features

Use `Features` for new or expanded remote-agent capabilities visible to users, operators, or API consumers.

Do not classify development workflow improvements as product features. For example, adding lefthook-based commit checks may be a `feat` commit, but it is not a remote-agent software feature and usually should not appear in release notes.

### Fixes

Use `Fixes` for bugs that existed in a previously released version and are now corrected.

Be careful with fix commits that only repair a feature introduced earlier in the same unreleased cycle. If the broken state was never released to users, do not list it as a bug fix. Instead:

- merge it into the related feature entry, or
- omit it if it is only an implementation correction.

Do not list CI fixes, release automation fixes, test fixes, lint fixes, or development-tool fixes as product bug fixes unless they directly affect the published package or user-visible behavior.

### Performance

Use `Performance` only for changes that improve runtime behavior, responsiveness, resource usage, or scalability of remote-agent.

Do not use it for build-time, CI-time, or developer-tool performance unless that is relevant to users of the published software.

### Maintenance / Internal Changes

Most internal changes should be omitted from release notes, including:

- CI changes
- test-only updates
- lint/format/tooling configuration
- refactors with no user-visible impact
- release automation changes
- dependency updates with no notable user-facing impact
- documentation-only changes that do not change product behavior

Include such changes only when they are important for users, operators, or package consumers to know.

## Rewriting Rules

The generated draft uses commit-message text. Rewrite entries into release-note prose.

Good release-note entries should be:

- user-facing or operator-facing
- concise but understandable
- written in past tense or neutral descriptive style
- free of commit-message prefixes, implementation noise, and unnecessary scopes
- grouped under the category that best reflects the released product behavior

Avoid:

- raw commit-message phrasing such as “add x”, “fix y”, or “refactor z” when it reads like a developer task
- mentioning commit hashes or authors unless intentionally preserving generated metadata
- exposing temporary bugs that were introduced and fixed before the release
- listing every small internal commit separately

## Suggested Review Workflow

1. Read the generated release note draft.
2. Inspect the commit list between the previous tag and the new tag when needed:

```bash
git log --oneline vPREVIOUS..vNEXT
```

3. Identify entries that should be:
   - kept as-is
   - rewritten
   - moved to another category
   - merged with another entry
   - removed entirely
4. Produce a concrete review report before editing.
5. Rewrite the release notes based on that report.

For a second-pass review, ask another agent to review the draft against this guideline, for example:

```bash
pi -p 'Read docs/release-note-guideline.md, review the Release Note at <url>, and identify concrete changes that should be made. Do not edit files or GitHub releases; only report findings.'
```

## Final Shape

A typical release note should look like:

```markdown
## Highlights

- Summarize the most important user-facing changes.

## Changes

### Features

- Describe product capabilities added or expanded.

### Fixes

- Describe user-visible bugs fixed from previous releases.

### Performance

- Describe runtime performance improvements.

[View changes on GitHub](https://github.com/d-kimuson/remote-agent/compare/vPREVIOUS...vNEXT)
```

Omit empty sections.
