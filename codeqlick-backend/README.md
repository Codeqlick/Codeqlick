# codeqlick-backend

REST API of the Codeqlick platform: authentication, contact-form leads, blog, portfolio, client
projects and user management. Built with NestJS 12 (ESM), Prisma 7 on PostgreSQL 18 and Zod 4.

The binding design lives in [`../docs/architecture.md`](../docs/architecture.md) (sections 4 and 5).
This README is the practical companion.

## Quick start

The API normally runs in Docker together with the rest of the platform: `docker compose up --build -d`
from the repository root (see the [root README](../README.md)). To run it on the host instead:

```bash
# from the repository root: PostgreSQL + Mailpit only
docker compose up -d db mailpit

cd codeqlick-backend
cp .env.example .env
npm ci
npm run prisma:generate
npm run db:migrate     # applies prisma/migrations to the local database
npm run db:seed        # creates the admin from SEED_ADMIN_* in .env
npm run dev            # http://localhost:4000/v1, OpenAPI UI at http://localhost:4000/docs
```

Requires Node.js 24. `.npmrc` enforces `save-exact` and `engine-strict`; every dependency is
pinned to an exact version on purpose.

## Scripts

| Script                            | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                     | Nest in watch mode                                                    |
| `npm run build`                   | Compiles `src/` (including the generated Prisma client) to `dist/`    |
| `npm start`                       | Runs `dist/main.js`                                                   |
| `npm run lint`                    | oxlint                                                                |
| `npm run format` / `format:check` | Prettier write / check                                                |
| `npm run typecheck`               | `tsc --noEmit` over src, tests and config files                       |
| `npm test` / `test:watch`         | Vitest unit tests (`src/**/*.spec.ts`)                                |
| `npm run test:e2e`                | Vitest + Supertest against a real database (`test/**/*.e2e-spec.ts`)  |
| `npm run prisma:generate`         | Generates the client into `src/generated/prisma` (git-ignored)        |
| `npm run db:migrate`              | `prisma migrate dev` (creates/applies migrations locally)             |
| `npm run db:deploy`               | `prisma migrate deploy` (production / CI)                             |
| `npm run db:seed`                 | Upserts the first admin from `SEED_ADMIN_EMAIL` / `PASSWORD` / `NAME` |

E2E tests need a migrated PostgreSQL reachable at `DATABASE_URL` (defaults to the docker
compose database). They create and clean up their own users and content.

## Module map

```
src/
  main.ts                 bootstrap: Nest app, Swagger (non-production), listen on PORT
  app.setup.ts            helmet, CORS, trust proxy, /v1 prefix, Standard Schema pipe, problem filter
  app.module.ts           all modules + global guards: Throttler -> JwtAuth -> Roles
  config/                 env.schema.ts (Zod), AppConfigService, logger (pino), swagger
  common/                 decorators (@Public, @Roles, @CurrentUser), guards, ProblemDetailsFilter,
                          shared schemas (pagination, locale, slug, id), Paginated<T>, translations
  prisma/                 PrismaModule (global) + PrismaService (adapter-pg)
  modules/
    health/               GET /v1/health (Terminus, database ping)
    auth/                 login, refresh (rotation + reuse detection), logout, me
    users/                /v1/admin/users
    mail/                 MailService over Nodemailer (JSON transport in tests)
    leads/                POST /v1/leads (public, honeypot) + /v1/admin/leads
    posts/                /v1/posts (public) + /v1/admin/posts
    portfolio/            /v1/portfolio (public) + /v1/admin/portfolio
    projects/             /v1/portal/projects (CLIENT/ADMIN) + /v1/admin/projects
    stats/                /v1/admin/stats
prisma/                   schema.prisma, migrations/, seed.ts
test/                     e2e tests
```

Inside a module the dependency direction is always
**controller -> service -> repository -> PrismaService**. Controllers only parse input and call
the service; services hold the rules and throw Nest HTTP exceptions; repositories are the only
files that touch Prisma; `<module>.schemas.ts` holds the Zod request schemas and inferred types.

## How auth works

- `POST /v1/auth/login` verifies the Argon2id hash (a dummy verify runs for unknown emails so
  timing doesn't reveal accounts; inactive users are rejected) and returns
  `{ accessToken, refreshToken, expiresIn, user }`.
- The **access token** is an HS256 JWT (`sub`, `email`, `name`, `role`) valid for
  `JWT_ACCESS_TTL` seconds (15 min by default). Send it as `Authorization: Bearer <token>`.
- The **refresh token** is 48 random bytes (base64url). Only its SHA-256 hash is stored, one
  `sessions` row per token, grouped by `familyId`. `POST /v1/auth/refresh` revokes the
  presented token, links it to its replacement (`replacedById`) and returns a new pair.
  Presenting an already-rotated token is treated as theft: every session in that family is
  revoked and the call returns 401.
- `POST /v1/auth/logout` revokes the given refresh token. Deactivating a user, resetting their
  password or changing their role revokes all of their sessions.
- `JwtAuthGuard` is global: **every route requires a token** unless it is decorated with
  `@Public()`. `RolesGuard` then enforces `@Roles('ADMIN')` / `@Roles('CLIENT', 'ADMIN')`.
- Login, refresh and the contact form are limited to 5 requests per minute per IP; everything
  else to 100 per minute. `trust proxy` is set to 1 hop (Nginx).

## Errors

Every error is an RFC 9457 problem document served as `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed",
  "instance": "/v1/leads",
  "errors": [{ "path": "email", "message": "Invalid email address" }],
  "requestId": "…"
}
```

Prisma unique violations map to 409, missing records to 404. Anything unexpected is a generic
500; the stack trace is logged with the request id (also returned in the `x-request-id` header).

## Adding a module

1. Create `src/modules/<name>/` with `<name>.schemas.ts` (Zod 4 schemas, `.strict()` bodies,
   `z.infer` types), `<name>.repository.ts`, `<name>.service.ts`, `<name>.controller.ts`
   (and `admin-<name>.controller.ts` for admin routes) and `<name>.module.ts`.
2. Validate input with `@Body({ schema })`, `@Query({ schema })` and `@Param({ schema })`; reuse
   `paginationSchema`, `idParamSchema`, `slugSchema` and `localeSchema` from `common/schemas`.
3. Decide access explicitly: `@Public()` for anonymous routes, `@Roles('ADMIN')` for admin
   ones; anything else requires a logged-in user.
4. Return plain objects that match the contract in `docs/architecture.md` section 5 (ISO date
   strings, lowercase locales, `paginate()` for lists). Never return `passwordHash`.
5. Register the module in `app.module.ts`, add a `*.service.spec.ts` with a mocked repository,
   and update section 5 of the architecture doc in the same pull request.
6. Schema changes: edit `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>` and
   commit the generated migration.

## Docker

`Dockerfile` builds a `node:24-alpine` image that runs as the unprivileged `node` user and
executes `prisma migrate deploy` before starting the API. Dev dependencies are kept in the
image on purpose because the Prisma CLI is a dev dependency (see the comment in the Dockerfile).
