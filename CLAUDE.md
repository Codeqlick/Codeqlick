# CLAUDE.md

Context for Claude Code working in this repository. Read `docs/architecture.md` before changing anything — it is the binding spec (structure, data model, auth, API contract v1, decisions).

## Project

Codeqlick is a software and web-app studio. Tagline: *Redefining information technology in society* (always in English, sentence case, never placed next to the logo).

This repo holds the whole platform:

| Folder | What | Status |
|---|---|---|
| `codeqlick-backend/` | NestJS 12 (ESM) + Prisma 7.10 + PostgreSQL 18 REST API under `/v1` | Running; lint, typecheck, unit and e2e tests and build pass |
| `codeqlick-frontend/` | Next.js 16 + React 19 + next-intl (EN/ES) website, blog, portfolio, contact, client portal, admin panel | Running; all sections of architecture 6 exist; the landing follows the approved design ("Codeqlick Website" canvas); lint, typecheck, unit tests and build pass |
| `deploy/` + `docker-compose.prod.yml` | Production stack for the OVH VPS (Nginx sites, env template, runbook); `deploy/sites/` publishes static client sites (template: `Codeqlick/web-basica`) | Deployed |
| `docs/architecture.md` | Architecture and API contract | Source of truth |
| `tools/` | Scripts for client projects' repositories (architecture 8.1): `codeqlick-draft.sh` sends a work summary as a draft update, `codeqlick-tasks.sh` reads and closes the project's tasks, `codeqlick-brief.sh` prints the client's brief | Ready |

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
- **Document before implementing:** a feature's spec goes into `docs/architecture.md` and its row into the Notion roadmap before its code.
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
`docker compose exec`). Browser tests: `npm run test:e2e` in `codeqlick-frontend` against the
running dev stack (`E2E_BASE_URL=http://localhost:<WEB_PORT>`); they also run in CI. Run `next build` on the host, not inside the `web` dev container: that
container sets `NODE_ENV=development`, which breaks production builds.

## Next steps (in order)

1. **Content.** Three blog posts and the three demo case studies are drafts in `/es/admin`: review and publish them.
2. **Basic websites end to end** — `docs/architecture.md` section 11, one PR per part, in its order: proposal templates, the basic-website page, managed sites, one-step onboarding, client editing, the online request, visits, domain renewal.

Outgoing email in production goes through OVH's SMTP (`ssl0.ovh.net:465`) as `hello@codeqlick.com`; the settings live in `/srv/codeqlick/.env`. Every email is plain text plus branded HTML (`codeqlick-backend/src/modules/mail/email-layout.ts`).

## Production

Live at https://codeqlick.com and https://api.codeqlick.com on the OVH VPS (`/srv/codeqlick`, user `cqadmin`, web on `127.0.0.1:3010`, api on `127.0.0.1:4010`). To release: merge to `main`. Once that commit's CI passes, the Deploy workflow (`.github/workflows/deploy.yml`) runs `./deploy/deploy.sh` on the server (pulls, builds, restarts and verifies; fails when the site isn't serving). Changes that trigger no CI (only `deploy/` or docs) need the workflow run by hand, or `./deploy/deploy.sh` as `cqadmin`. `/srv/domfeliu` and `/srv/circlesfera*` belong to other projects — don't touch them. Details in `deploy/README.md`.
