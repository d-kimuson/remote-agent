# AGENTS.md (remote-agent)

## Architecture

`remote-agent` は、ACP 対応 Agent を Web UI から操作できるかを検証するための単一パッケージ remote agent です。Hono が ACP セッションを保持する BFF として動き、TanStack SPA がその API を使って Agent の起動・会話・セッション操作を行います。

```
browser SPA
  -> Hono API/BFF
  -> ACP provider
  -> ACP-compatible agent process
  -> response / plan / diff / terminal data
  -> browser SPA
```

- ブラウザからローカル Agent を直接起動せず、Node 側で ACP セッションを保持する。
- サーバ API は薄く保ち、画面側の状態管理は TanStack Query と React に寄せる。
- 実験コードでも関数型・不変データ・型駆動を優先する。

## Reference

- Coding guideline (design philosophy): docs/coding-guideline.md
- Coding process and conventions: docs/coding-process.md
- Commit message conventions: docs/commit_message.md
- Branch naming conventions: docs/branch_naming.md
- E2E exploratory testing process: docs/e2e-exploratory-testing-process.md
