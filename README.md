# Codeqlick

> *Redefining information technology in society*

Codeqlick's platform: the public website ([codeqlick.com](https://codeqlick.com)), blog, portfolio, contact pipeline, client portal and admin panel.

| App | Stack | Docs |
|---|---|---|
| [`codeqlick-frontend`](codeqlick-frontend) | Next.js 16 · React 19 · next-intl (EN/ES) | [README](codeqlick-frontend/README.md) |
| [`codeqlick-backend`](codeqlick-backend) | NestJS 12 · Prisma 7 · PostgreSQL 18 | [README](codeqlick-backend/README.md) |

Read [docs/architecture.md](docs/architecture.md) before contributing — it defines the structure, the API contract and the rules both apps follow.

## Requirements

- Docker with Compose
- Node.js 24 LTS (`nvm use` reads `.nvmrc`) — only for editor tooling and running scripts on the host

## Run locally

Everything runs in Docker with hot reload: the source folders are mounted into the containers.

```bash
docker compose up --build -d
docker compose exec api npx prisma db seed   # first time: creates the admin (SEED_ADMIN_* in docker-compose.yml)
```

| Service | URL |
|---|---|
| Website | http://localhost:3000 |
| API | http://localhost:4000/v1 (OpenAPI docs at http://localhost:4000/docs) |
| Mailpit inbox (fake SMTP) | http://localhost:8025 |
| PostgreSQL | `localhost:5432` (`codeqlick` / `codeqlick`) |

Migrations are applied when the `api` container starts. Useful commands:

```bash
docker compose logs -f api web                    # follow the apps
docker compose exec api npx prisma migrate dev    # create a migration after editing schema.prisma
docker compose exec api npm test                  # run a script inside a container
docker compose down                               # stop (add -v to also drop the database)
```

After changing dependencies, restart the service (`docker compose restart api`): it reinstalls when `package-lock.json` changed.

If a port is taken on your machine, set `WEB_PORT`, `API_PORT`, `DB_PORT`, `SMTP_PORT` or `MAILPIT_PORT` in a git-ignored `.env` next to `docker-compose.yml`.

To run an app on the host instead, see its README; `.env.example` in each app has the settings for that.

## Deploy

See [deploy/README.md](deploy/README.md) for the OVH VPS setup (`/srv/codeqlick`, Docker Compose, Nginx, Let's Encrypt).

## Conventions

- **Dependencies are pinned to exact versions** — no `^` or `~`. `.npmrc` enforces `save-exact=true`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
- Branch from `main`, open a pull request, CI must be green to merge.
