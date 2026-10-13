# Codeqlick

> *Redefining information technology in society*

Codeqlick's platform: the public website ([codeqlick.com](https://codeqlick.com)), blog, portfolio, contact pipeline, client portal and admin panel.

| App | Stack | Docs |
|---|---|---|
| [`codeqlick-frontend`](codeqlick-frontend) | Next.js 16 · React 19 · next-intl (EN/ES) | [README](codeqlick-frontend/README.md) |
| [`codeqlick-backend`](codeqlick-backend) | NestJS 12 · Prisma 7 · PostgreSQL 18 | [README](codeqlick-backend/README.md) |

Read [docs/architecture.md](docs/architecture.md) before contributing — it defines the structure, the API contract and the rules both apps follow.

## Requirements

- Node.js 24 LTS (`nvm use` reads `.nvmrc`)
- Docker with Compose

## Run locally

```bash
# 1. Infrastructure: PostgreSQL on :5432, Mailpit (fake SMTP) on :1025 with inbox at http://localhost:8025
docker compose up -d

# 2. API on http://localhost:4000 (OpenAPI docs at /docs)
cd codeqlick-backend
cp .env.example .env
npm ci
npx prisma migrate dev
npx prisma db seed        # creates the first admin from SEED_ADMIN_* in .env
npm run dev

# 3. Website on http://localhost:3000
cd ../codeqlick-frontend
cp .env.example .env.local
npm ci
npm run dev
```

## Deploy

See [deploy/README.md](deploy/README.md) for the OVH VPS setup (`/srv/codeqlick`, Docker Compose, Nginx, Let's Encrypt).

## Conventions

- **Dependencies are pinned to exact versions** — no `^` or `~`. `.npmrc` enforces `save-exact=true`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
- Branch from `main`, open a pull request, CI must be green to merge.
