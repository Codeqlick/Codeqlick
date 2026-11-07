# codeqlick-frontend

The Codeqlick website (EN/ES), client portal and admin panel. Built with Next.js 16 (App Router),
React 19 and next-intl, styled with CSS Modules and the brand tokens.

The binding design lives in [`../docs/architecture.md`](../docs/architecture.md) (section 6).
This README is the practical companion. Next.js 16 differs from older versions: read
[`AGENTS.md`](AGENTS.md) first.

## Quick start

The site normally runs in Docker with the rest of the platform: `docker compose up --build -d`
from the repository root (see the [root README](../README.md)). To run it on the host instead,
with the API running (Docker or host):

```bash
cd codeqlick-frontend
cp .env.example .env.local
npm ci
npm run dev            # http://localhost:3000/en
```

Run production builds on the host, not inside the `web` dev container (it sets
`NODE_ENV=development`, which breaks `next build`).

## Scripts

| Script                            | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Next.js dev server                                                     |
| `npm run build` / `npm start`     | Production build / serve it                                            |
| `npm run lint`                    | oxlint                                                                 |
| `npm run format` / `format:check` | Prettier write / check                                                 |
| `npm run typecheck`               | `tsc --noEmit`                                                         |
| `npm test` / `test:watch`         | Vitest unit tests (`src/**/*.test.ts(x)`)                              |
| `npm run test:e2e`                | Playwright against a running stack (`E2E_BASE_URL`, default port 3000) |

## Rules of thumb

- **BFF:** the browser never calls the API. Server Components read with `src/lib/api/*`, Server
  Actions write; tokens live in the httpOnly cookies `cq_at` / `cq_rt`.
- Middleware is `src/proxy.ts`; `params`, `searchParams` and `cookies()` are async; use
  `revalidatePath`.
- Every piece of copy is in `src/messages/en.json` and `es.json` (Spanish of Spain).
- Styles: CSS Modules and the tokens in `src/styles/tokens.css`; no UI kits.
