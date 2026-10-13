# CLAUDE.md

Context for Claude Code working in this repository. Read `docs/architecture.md` before changing anything — it is the binding spec (structure, data model, auth, API contract v1, decisions).

## Project

Codeqlick is a software and web-app studio. Tagline: *Redefining information technology in society* (always in English, sentence case, never placed next to the logo).

This repo holds the whole platform:

| Folder | What | Status |
|---|---|---|
| `codeqlick-backend/` | NestJS 12 (ESM) + Prisma 7.10 + PostgreSQL 18 REST API under `/v1` | Written, **never installed or run yet** |
| `codeqlick-frontend/` | Next.js 16 + React 19 + next-intl (EN/ES) website, blog, portfolio, contact, client portal, admin panel | **Work in progress**: config, i18n, brand and UI components only |
| `docs/architecture.md` | Architecture and API contract | Source of truth |

Both apps were written in a sandbox without npm access, so **nothing has been compiled or tested yet**. Expect some fixes on first install.

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

```bash
docker compose up -d                     # PostgreSQL :5432 + Mailpit :1025 (inbox :8025)

cd codeqlick-backend
cp .env.example .env
npm install                              # first time creates package-lock.json — commit it
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run dev                              # http://localhost:4000, docs at /docs

cd ../codeqlick-frontend
cp .env.example .env.local
npm install
npm run dev                              # http://localhost:3000
```

## Next steps (in order)

1. **Backend: make it green.** `npm install`, `npx prisma generate`, then `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`. Fix whatever fails. Points flagged as uncertain when written:
   - `src/config/swagger.ts` — the `standardSchemaConverter` option of `@nestjs/swagger` 12.
   - `prisma/schema.prisma` — `moduleFormat` / `importFileExtension` generator options (remove if Prisma rejects them).
   - `src/common/filters/problem-details.filter.ts` — shape of NestJS 12 validation errors and Prisma adapter error metadata.
   - Check the hand-written migration in `prisma/migrations/20261013000000_init` matches `schema.prisma` (`npx prisma migrate diff`).
   Commit `package-lock.json`.
2. **Frontend: finish it** following `docs/architecture.md` section 6: proxy (i18n + token refresh + route protection), API client, auth/session, pages (landing reproducing the approved static design, blog, work, contact, login, portal, admin), messages `en.json`/`es.json` with identical keys, `robots`/`sitemap`/`manifest`, Dockerfile, `.github/workflows/frontend.yml`. Then lint, typecheck, build.
3. **Deployment:** `docker-compose.prod.yml` + Nginx for `codeqlick.com` (web) and `api.codeqlick.com` (API) on the OVH VPS under `/srv/codeqlick` (other projects live in `/srv/domfeliu` and `/srv/circlesfera` — don't touch them). Document it in `deploy/README.md`.
4. Open a PR from `feat/architecture` to `main` once CI is green.
