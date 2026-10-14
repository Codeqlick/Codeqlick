# Deploying Codeqlick

Production runs on the OVH VPS under `/srv/codeqlick` with Docker Compose. The host's Nginx
terminates TLS (Let's Encrypt) and proxies to the containers, which only listen on `127.0.0.1`:

| Public host | Proxies to | Container |
|---|---|---|
| `codeqlick.com` (`www` redirects to it) | `127.0.0.1:3010` | `web` (Next.js) |
| `api.codeqlick.com` | `127.0.0.1:4010` | `api` (NestJS) |

PostgreSQL (`db`) is reachable only from inside the Compose network. The other projects on the
server (`/srv/domfeliu`, `/srv/circlesfera`) are independent: don't touch their folders, containers
or Nginx sites.

## Requirements

- DNS `A`/`AAAA` records for `codeqlick.com`, `www.codeqlick.com` and `api.codeqlick.com` pointing at the VPS.
- Docker with the Compose plugin, Nginx and Certbot (`python3-certbot-nginx`) on the host.
- SMTP credentials for outgoing email.

## First deployment

```bash
sudo mkdir -p /srv/codeqlick && sudo chown "$USER" /srv/codeqlick
git clone https://github.com/Codeqlick/Codeqlick.git /srv/codeqlick
cd /srv/codeqlick

cp deploy/.env.example .env
chmod 600 .env
nano .env            # POSTGRES_PASSWORD, JWT_ACCESS_SECRET, SMTP_* (see the comments in the file)

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps      # db, api and web should be "healthy"
```

The `api` container applies pending database migrations every time it starts.

Check which loopback ports are free before starting (`ss -ltnp | grep -E ':(3010|4010)\b'`). If
another project uses them, change `WEB_PORT` / `API_PORT` in `.env` and the matching `proxy_pass`
lines in `deploy/nginx/*.conf`.

### Create the first admin

```bash
docker compose -f docker-compose.prod.yml exec \
  -e SEED_ADMIN_EMAIL=you@codeqlick.com \
  -e SEED_ADMIN_NAME='Your Name' \
  -e SEED_ADMIN_PASSWORD='at-least-12-characters' \
  api npx prisma db seed
```

Running it again with the same email resets that account's name and password. Create the rest of
the accounts from the admin panel (`/en/admin/users`).

### Nginx and TLS

```bash
sudo cp deploy/nginx/codeqlick.com.conf     /etc/nginx/sites-available/
sudo cp deploy/nginx/api.codeqlick.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/codeqlick.com.conf     /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.codeqlick.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d codeqlick.com -d www.codeqlick.com -d api.codeqlick.com
```

The site files are HTTP-only on purpose: Certbot adds the HTTPS listeners, the certificates and
the HTTP → HTTPS redirect, and renews them automatically. Both files send `X-Real-IP` and
`X-Forwarded-For`; the API's rate limits (login, contact form) depend on them.

Then check https://codeqlick.com, https://codeqlick.com/en/login and
https://api.codeqlick.com/v1/health.

## Updating

```bash
cd /srv/codeqlick
./deploy/deploy.sh
```

The script pulls `main`, builds the images while the old containers keep serving, restarts the
stack and waits until every service is healthy and the site and the API answer. If they don't, it
starts the stack once more (Docker can fail to replace a container, which leaves `api` and `web`
stopped) and checks again. It exits with an error, printing the container status and the last
logs, when the release still isn't serving. Expect a few seconds of downtime while `api` and `web`
restart. `./deploy/deploy.sh --no-pull` rebuilds and restarts the current checkout.

## Operations

```bash
docker compose -f docker-compose.prod.yml logs -f --tail 100 api web   # logs
docker compose -f docker-compose.prod.yml restart web                  # restart one service
docker compose -f docker-compose.prod.yml down                         # stop (data is kept)
```

### Backups

The database lives in the `codeqlick-prod_db-data` Docker volume. The `backup` service dumps it to
`/srv/codeqlick/backups` when it starts and then once a day, and deletes dumps older than 14 days
(`BACKUP_*` settings in `.env`). Before the first start, create the folder and tell the service
who owns it:

```bash
mkdir -m 700 backups
echo "BACKUP_USER=$(id -u):$(id -g)" >> .env
```

```bash
docker compose -f docker-compose.prod.yml ps backup         # "healthy" = a dump from the last two days exists
docker compose -f docker-compose.prod.yml logs backup       # one line per dump
docker compose -f docker-compose.prod.yml restart backup    # take a dump now
```

These dumps sit on the same disk as the database, so they protect against a bad migration or a
deleted row, not against losing the server. Copy them somewhere else regularly, for example from
your own machine:

```bash
rsync -a cqadmin@<server>:/srv/codeqlick/backups/ ~/codeqlick-backups/
```

Restore a dump (it replaces the current data):

```bash
docker compose -f docker-compose.prod.yml stop api web
docker compose -f docker-compose.prod.yml exec backup \
  pg_restore --clean --if-exists --no-owner -d codeqlick /backups/codeqlick-<timestamp>.dump
docker compose -f docker-compose.prod.yml start api web
```

Images uploaded from the admin panel live in the `codeqlick-prod_uploads-data` volume. The same
service copies new ones to `backups/uploads/` on every run. That folder only grows: an image
deleted from the admin panel stays there. To restore them all:

```bash
docker compose -f docker-compose.prod.yml cp backups/uploads/. api:/app/uploads/
```

`docker compose -f docker-compose.prod.yml down -v` deletes the volumes and with them the database and the uploaded images.

## Notes

- The OpenAPI UI (`/docs`) is disabled in production.
- Auth cookies are `Secure` in production, so sign-in only works over HTTPS.
- `.env` holds every secret; it is git-ignored and should stay readable only by the deploy user.
