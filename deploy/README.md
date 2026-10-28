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

### Automatic deploys

Merging to `main` releases on its own: when the Backend, Frontend and E2E runs of that commit
pass, `.github/workflows/deploy.yml` connects as the deploy user and runs `deploy/ci-deploy.sh`,
which takes a lock (one release at a time) and runs `deploy/deploy.sh`; then it checks the public
site and API. A failed CI run means no release. Changes that trigger no CI (only `deploy/` or docs)
aren't released: run the workflow by hand (Actions → Deploy → Run workflow) or deploy as above.

How it is wired:

- A dedicated SSH key (comment `github-actions-deploy@codeqlick`). Its public half is in
  `~cqadmin/.ssh/authorized_keys`, pinned to the release:
  `command="/srv/codeqlick/deploy/ci-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`.
  Whatever command the client sends, that key can only run a release.
- GitHub secrets: `DEPLOY_SSH_KEY` (the private key), `DEPLOY_KNOWN_HOSTS` (the server's host keys,
  from `ssh-keyscan`) and `DEPLOY_TARGET` (`cqadmin@<server>`).
- To revoke it, delete that line from `authorized_keys`. To rotate it, generate a new key and
  replace both the line and the `DEPLOY_SSH_KEY` secret.

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

Images and project files uploaded from the admin panel live in the `codeqlick-prod_uploads-data`
volume (project files in its `project-files/` folder). The same service copies new ones to
`backups/uploads/` on every run. That folder only grows: a file deleted from the admin panel stays
there. To restore them all:

```bash
docker compose -f docker-compose.prod.yml cp backups/uploads/. api:/app/uploads/
```

`docker compose -f docker-compose.prod.yml down -v` deletes the volumes and with them the database and the uploaded images.

### HTTP/2

The Nginx sites of this project have `http2 on;` (nginx 1.25 or later). On a server set up before that
was added, turn it on in the installed files and reload:

```bash
sudo sed -i --follow-symlinks '/listen 443 ssl; # managed by Certbot/a\    http2 on;' \
  /etc/nginx/sites-enabled/codeqlick.com.conf /etc/nginx/sites-enabled/api.codeqlick.com.conf \
  /etc/nginx/sites-enabled/stats.codeqlick.com.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI --http2 https://codeqlick.com/en | head -1   # HTTP/2 200
```

### Monitoring

`deploy/monitor/monitor.sh` runs from the deploy user's crontab every 5 minutes. It checks:

- the public site and API (through Nginx and TLS);
- the Docker health of `db`, `api`, `web`, `backup` and `umami` (`backup` is unhealthy without a dump from the last two days);
- disk use (alerts at 90%);
- the TLS certificates (alerts at 14 days left).

It emails `ALERT_TO` (in production `admin@codeqlick.com`; default: `LEADS_NOTIFY_TO`) through the site's SMTP account with `curl`. The email uses the same branded design as the client emails: the API image builds it (`dist/scripts/monitor-email.js`, with `docker compose run`, so even with the API stopped). If Docker can't build it, a plain-text email goes instead. It writes only when the result changes, with no reminders in between. A problem must show up in two checks in a row (10 minutes) before the alert email goes out, so a deploy's restart doesn't trigger one. A "Resolved" email follows when everything is back. State and a log of alerts live in `~/.codeqlick-monitor/`.

```bash
crontab -l                                  # */5 * * * * /srv/codeqlick/deploy/monitor/monitor.sh
./deploy/monitor/monitor.sh --test          # send a test email
cat ~/.codeqlick-monitor/monitor.log        # past alerts
```

It runs on the server itself, so it can't report the whole server going down. An external check
(e.g. UptimeRobot on `https://codeqlick.com/en` and `https://api.codeqlick.com/v1/health`) covers
that.

### Analytics (Umami)

Cookieless visit statistics, no consent banner needed. `umami` and its database `umami-db` run
next to the site. Visitors' browsers never reach Umami: the site serves the tracker and forwards
its events at `/api/stats/*`. Admin and portal pages are not tracked; neither are visitors with
"Do Not Track" on. Sent contact requests are counted as the `contact-sent` event.

Set-up (once): put `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` in `.env` (`openssl rand -hex 24`
each) and deploy. Then sign in to the dashboard (first login `admin` / `umami`), **change that
password**, add the website `codeqlick.com`, copy its id to `UMAMI_WEBSITE_ID` in `.env` and
deploy again (the pages are rebuilt with the tracker).

The dashboard is at https://stats.codeqlick.com (user `admin`, password `UMAMI_ADMIN_PASSWORD` in
`.env`). It needs a DNS `A` record for `stats` and its Nginx site, installed once with sudo:

```bash
sudo cp /srv/codeqlick/deploy/nginx/stats.codeqlick.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/stats.codeqlick.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d stats.codeqlick.com
```

Without it, open the dashboard (it listens on `127.0.0.1:3020`) through an SSH tunnel at
http://localhost:3020:

```bash
ssh -N -L 3020:127.0.0.1:3020 cqadmin@<server>
```

Analytics is not part of the daily backups: losing it loses statistics, nothing else.

### Locked out of two-step verification

If someone lost both their phone and their recovery codes, turn two-step verification off for
them; they sign in with their password and can set it up again from their account page:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U codeqlick -d codeqlick -c \
  "UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
   totp_recovery_hashes = '{}' WHERE email = 'person@example.com';"
```

## Notes

- The OpenAPI UI (`/docs`) is disabled in production.
- Auth cookies are `Secure` in production, so sign-in only works over HTTPS.
- `.env` holds every secret; it is git-ignored and should stay readable only by the deploy user.

## Client sites

Static client sites are served by the host's Nginx straight from
`/srv/codeqlick/sites/<name>/current`. There are two kinds:

- **Managed sites** (basic websites): their content lives in the platform's database and the
  `site-builder` service builds them from the template in `codeqlick-sites/web-basica` whenever it
  changes. `deploy/sites/sync-sites.sh` (cron, every minute) publishes their domains.
- **Custom sites**: their own repository (a copy of the template or anything static), built and
  uploaded from the machine that has it with `deploy/sites/publish-site.sh`.

Both go through:

- `deploy/sites/cq-site`, run as root through `sudo`: creates or removes the Nginx site
  (`/etc/nginx/sites-available/cq-site-<domain>.conf`) and its Let's Encrypt certificate. It only
  touches its own files and refuses domains another site already serves (domfeliu, circlesfera…).
- `deploy/sites/publish-site.sh`, run from the machine that has the site's repository: builds it,
  uploads it as a new release (the last 5 are kept), switches `current` to it and, the first time,
  calls `cq-site`.

### One-time setup (root)

The deploy user has no sudo. Install a root-owned **copy** of the helper (never a link to the
checkout: the deploy user can edit it) and allow only that command:

```bash
sudo install -o root -g root -m 755 /srv/codeqlick/deploy/sites/cq-site /usr/local/sbin/cq-site
echo 'cqadmin ALL=(root) NOPASSWD: /usr/local/sbin/cq-site' | sudo tee /etc/sudoers.d/cq-site
sudo chmod 440 /etc/sudoers.d/cq-site && sudo visudo -c
```

Repeat the `install` line whenever `deploy/sites/cq-site` changes. Then, as `cqadmin`:

```bash
mkdir -p /srv/codeqlick/sites
echo "SITES_USER=$(id -u):$(id -g)" >> .env
echo "SITE_BUILDER_TOKEN=$(openssl rand -hex 32)" >> .env
(crontab -l; echo '* * * * * /srv/codeqlick/deploy/sites/sync-sites.sh') | crontab -
```

`site-builder` runs as `SITES_USER` so the releases it writes belong to the deploy user; the API
calls it with `SITE_BUILDER_TOKEN` inside the Docker network (it publishes no port). Its log of
published domains is `~/.codeqlick-sites.log`.

Request previews (`<name>-<random>.demo.codeqlick.com`) are built by the same builder; when one
expires the builder leaves a `remove` file in its folder and `sync-sites.sh` unpublishes it
(`cq-site remove`) and deletes the folder.

DNS: demos and previews live under `*.demo.codeqlick.com` (one wildcard `A` record to the
server). A client's own domain needs its `A` records (`@` and `www`) pointing at the server before
publishing (see "Client domains" for the managed ones); without it `cq-site` publishes over HTTP only and exits with 3, and running it
again later adds HTTPS.

### Client domains (OVH)

Clients register and pay their own domain (architecture, decision 15). To connect it without
their password, they make the team's OVH account its **technical contact**; the API then points
the apex and `www` at the server and reads the expiry (also for `.es`). Without the keys below,
availability comes from RDAP (unknown for `.es`) and clients point their DNS themselves.

1. Create the keys at <https://eu.api.ovh.com/createToken/> (signed in with the team's account),
   with no expiry and these rights:

   | Method | Path |
   |---|---|
   | GET | `/domain`, `/domain/*` |
   | GET, POST, PUT, DELETE | `/domain/zone/*` |
   | POST | `/order/cart` |
   | GET | `/order/cart/*` |

2. Add them to `/srv/codeqlick/.env` with the account ID (the NIC handle, `xx12345-ovh`, top right
   in the OVH manager) and the server IP, then deploy (or `docker compose -f
   docker-compose.prod.yml up -d api`):

   ```bash
   OVH_APPLICATION_KEY=…
   OVH_APPLICATION_SECRET=…
   OVH_CONSUMER_KEY=…
   OVH_NIC_HANDLE=xx12345-ovh
   SITES_SERVER_IP=54.37.159.171
   ```

The portal shows clients the NIC handle and the IP. Each change OVH's API makes to a zone is in
the admin activity log; MX and other records are never touched.

### Buying a preview online (Stripe)

Requesters can buy their website from its preview (architecture 8.2, decision 20) for
`SITE_PRICE_CENTS` + `SITE_VAT_PERCENT` (200 € + 21 % IVA). It uses **Codeqlick's** Stripe account
(not CircleSfera's) and is off until `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set.
Stripe issues each sale's invoice; the API creates the tax rate "IVA 21 %" in Stripe on the first
purchase. To switch it on:

1. In Stripe's dashboard (live mode): the business details and tax ID (NIF) that go on invoices
   (Settings → Business → Public details, and Settings → Billing → Invoices: tax ID shown, invoice
   numbering), and **email finalized invoices to customers** (Settings → Billing → Customer
   emails), plus successful-payment receipts if wanted.
2. Settings → Payment methods: keep the methods you want in Checkout (card, Apple Pay, Link…).
3. Developers → Webhooks → Add endpoint: URL `https://api.codeqlick.com/v1/payments/stripe`,
   events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
   `checkout.session.expired`. Copy its signing secret (`whsec_…`).
4. Developers → API keys: the live secret key (`sk_live_…`).
5. Add them to `/srv/codeqlick/.env` and recreate the API (`docker compose -f
   docker-compose.prod.yml up -d api`, or deploy):

   ```bash
   STRIPE_SECRET_KEY=sk_live_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   SITE_PRICE_CENTS=20000
   SITE_VAT_PERCENT=21
   ```

6. Rebuild the previews that are up (Admin → Vistas previas → each lead → "Reconstruir") so their
   bar offers the purchase; new ones get it on their own.

To try it locally with Codeqlick's test mode: put its test secret key (`sk_test_…`) in the root
`.env`, and forward the webhook with the Stripe CLI logged in to Codeqlick (`stripe login
--project-name codeqlick`): `stripe listen --project-name codeqlick --forward-to
localhost:4000/v1/payments/stripe`, whose `whsec_…` goes in the `.env` as `STRIPE_WEBHOOK_SECRET`.
Card `4242 4242 4242 4242`, any future date and CVC.

### Publishing

```bash
deploy/sites/publish-site.sh peluqueria peluqueria.demo.codeqlick.com ../web-basica examples/peluqueria
deploy/sites/publish-site.sh peluqueria-marta peluqueriamarta.es ../peluqueria-marta
```

Each run is a release; to roll back, point `current` at an older folder in `releases/`. To take a
site down: `sudo cq-site remove <domain>` and delete its folder. On the server,
`sudo cq-site list` shows the published domains. Turn on the project's uptime monitoring and its
site form in the admin panel.
