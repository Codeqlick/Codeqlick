# CLAUDE.md

Context for Claude Code working in this repository. Read `docs/architecture.md` before changing anything — it is the binding spec (structure, data model, auth, API contract v1, decisions).

## Project

Codeqlick is a software and web-app studio. Tagline: *Redefining information technology in society* (always in English, sentence case, never placed next to the logo).

This repo holds the whole platform:

| Folder | What | Status |
|---|---|---|
| `codeqlick-backend/` | NestJS 12 (ESM) + Prisma 7.10 + PostgreSQL 18 REST API under `/v1` | Running; lint, typecheck, unit and e2e tests and build pass |
| `codeqlick-frontend/` | Next.js 16 + React 19 + next-intl (EN/ES) website, blog, portfolio, contact, client portal, admin panel | Running; all sections of architecture 6 exist; the landing follows the approved design ("Codeqlick Website" canvas); lint, typecheck and build pass |
| `deploy/` + `docker-compose.prod.yml` | Production stack for the OVH VPS (Nginx sites, env template, runbook) | Deployed |
| `docs/architecture.md` | Architecture and API contract | Source of truth |

## Non-negotiable rules

- **Exact dependency versions, no `^` or `~`.** Use the latest *stable* release. `.npmrc` has `save-exact=true`. Install with `npm install <pkg>@<exact-version>`.
- **TypeScript 6.0.3, not 7.x** — TS 7's API isn't supported by linters/test tooling yet. Prisma **7.10.0, not 8.x RC**. Node **24 LTS**.
- Backend is **ESM**: relative imports end in `.js`, use `import.meta.dirname`, no `require`.
- Backend validation uses **Zod 4 via NestJS 12 Standard Schema**: `@Body({ schema })` + global `StandardSchemaValidationPipe`. Not class-validator.
- Backend layers: controller → service → repository → PrismaService. Only repositories touch Prisma.
- Prisma 7: generator `prisma-client` with output `src/generated/prisma`, no `url` in `schema.prisma`, URL in `prisma.config.ts`, `PrismaClient` needs the `PrismaPg` adapter.
- Frontend: **BFF pattern** — the browser never calls the API; Server Components, Server Actions and `src/proxy.ts` call it server-side. Tokens live in httpOnly cookies `cq_at` / `cq_rt`.
- Next.js 16: middleware is **`src/proxy.ts`**, `params`/`searchParams` are Promises, `cookies()` is async, use `revalidatePath` (not `revalidateTag`), no `next lint` (we use oxlint).
- Styling: CSS Modules + brand tokens. No Tailwind or UI kits.
- Lint with oxlint, format with Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`).
- Commits: Conventional Commits. Work on branches, open PRs to `main`.

## Brand

Fuchsia `#D9177E` (primary), fuchsia dark `#A80F5E`, fuchsia light `#FF7DBE`, ink `#14101F`, blush `#FCEAF3`, slate `#5C5768`. Fonts: Space Grotesk (display), IBM Plex Sans (body), JetBrains Mono (code/labels). Logo "Click Q": a ring (`circle cx=28 cy=28 r=18 stroke-width=8` in a 64×64 viewBox) whose tail is a cursor (`M36 36 L60 45 L49 48 L46 59 Z`) + the lowercase wordmark `codeqlick`.

Contact: hello@codeqlick.com · Social: facebook.com/Codeqlick, instagram.com/Codeqlick, x.com/Codeqlick

## Local setup

Everything runs in Docker with hot reload (source folders are bind-mounted):

```bash
docker compose up --build -d                    # web :3000 · api :4000 (/docs) · db :5432 · Mailpit :8025
docker compose exec api npx prisma db seed      # first time: admin@codeqlick.com / change-me-please-123
docker compose exec api npx prisma migrate dev  # after editing schema.prisma
```

Host ports can be overridden in a git-ignored root `.env` (`WEB_PORT`, `API_PORT`, `DB_PORT`, …).
Run checks with `npm run lint`, `npm run typecheck`, `npm test` in each app (host or
`docker compose exec`). Run `next build` on the host, not inside the `web` dev container: that
container sets `NODE_ENV=development`, which breaks production builds.

## Next steps (in order)

1. **Content.** Publish the first blog posts and case studies from `/en/admin`.
2. **Outgoing email.** Production runs with a placeholder `SMTP_HOST` in `/srv/codeqlick/.env`; leads are stored but no email is sent until real SMTP settings are set there.

## Production

Live at https://codeqlick.com and https://api.codeqlick.com on the OVH VPS (`/srv/codeqlick`, user `cqadmin`, web on `127.0.0.1:3010`, api on `127.0.0.1:4010`). To release: merge to `main`, then on the server run `./deploy/deploy.sh` as `cqadmin` (pulls, builds, restarts and verifies; non-zero exit when the site isn't serving). `/srv/domfeliu` and `/srv/circlesfera*` belong to other projects — don't touch them. Details in `deploy/README.md`.
