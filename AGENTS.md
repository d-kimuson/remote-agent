# AGENTS.md (remote-agent)

## Architecture

`remote-agent` は個人サーバー等にホスティングすることで、主にVPNネットワーク内の他マシンからコーディングエージェントを動かすためのツールです。

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

## Reference

- Coding guideline (design philosophy): docs/coding-guideline.md
- Coding process and conventions: docs/coding-process.md
- Commit message conventions: docs/commit_message.md
- Branch naming conventions: docs/branch_naming.md
- E2E exploratory testing process: docs/e2e-exploratory-testing-process.md

この AGENTS.md ファイルは必要な reference を dynamic に読む前提で薄く作られています。
必ず関連するリファレンスを参照してからタスクを開始すること。
