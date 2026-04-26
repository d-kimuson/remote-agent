# acp-playground

ACP を前提に、SPA から任意の Agent を動かせるか試すための playground です。

このリポジトリでは、ブラウザが直接ローカル Agent を起動するのではなく、`Hono` が ACP セッションを保持する BFF として動き、`TanStack SPA` がその API を通して Agent の起動、会話、mode/model 切替、plan/diff/terminal の観測を行います。

## Stack

- `Hono` for ACP session bridge and API
- `TanStack Router` + `React Query` for the SPA
- `shadcn/ui` + Tailwind CSS v4 for the UI
- `@mcpc-tech/acp-ai-provider` for ACP-compatible agent sessions

## Dev

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts:

- SPA: `http://localhost:33333`
- API/BFF: `http://localhost:8989`

Create a session from the left pane, then send a prompt from the center pane to verify the full `SPA -> Hono -> ACP agent` flow.
