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

### Video chat (videochat.codeqlick.com)

The random video chat (architecture 4.7 and 6.3) is served by the same web and API containers;
it needs its own host name, a TURN server and a few settings. Until it is set up, coturn stays
off (it is in the `videochat` Compose profile), so releases work without `TURN_SECRET`.

**One command** does the whole setup below, and is safe to run again:

```bash
cd /srv/codeqlick && git pull --ff-only && ./deploy/setup-videochat.sh
```

It creates the DNS record through OVH's API (the client-domains keys in `.env`), fills in the
settings (a new `TURN_SECRET`, `TURN_URLS`, `VIDEOCHAT_URL`, `COMPOSE_PROFILES=videochat`, and the
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` pair for notifications), opens
the ports in ufw, installs the Nginx site, gets the certificate once the DNS answers, releases and
checks. It asks for sudo. The same steps by hand:

1. **DNS:** an `A` record `videochat.codeqlick.com` → the server's IPv4 (`SITES_SERVER_IP`).
2. **Settings** in `/srv/codeqlick/.env` (template in `deploy/.env.example`): `TURN_SECRET`
   (`openssl rand -hex 32`), `TURN_URLS` (the default in the template), `COMPOSE_PROFILES=videochat`
   (turns coturn on) and, if it isn't https://videochat.codeqlick.com, `VIDEOCHAT_URL`. For the
   "someone is waiting" notifications, a VAPID key pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`);
   `deploy/deploy.sh` creates and saves it on the first release without it, so nothing is needed by
   hand (the manual command is in `deploy/.env.example`).
   `SITES_SERVER_IP` must be set: coturn announces it.
3. **Firewall:** open `3478/tcp`, `3478/udp` and the relay range `49160-49400/udp`
   (`sudo ufw allow 3478 && sudo ufw allow 49160:49400/udp`, or the OVH firewall).
4. **Nginx and TLS:**

   ```bash
   sudo cp deploy/nginx/videochat.codeqlick.com.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/videochat.codeqlick.com.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d videochat.codeqlick.com
   ```

5. Deploy (the `coturn` service starts with the stack), then open
   https://videochat.codeqlick.com, sign in, accept the rules and try a call from two devices on
   different networks (one on mobile data checks TURN).

Moderation is in Admin → Videochat. Reports of a possible minor suspend the account at once and
email `LEADS_NOTIFY_TO`. Explicit content between adults is allowed; before opening it to the
public, have the rules and the privacy text reviewed (Digital Services Act, age assurance). To
require a verified age instead of a declared one, set `VIDEOCHAT_AGE_VERIFICATION_REQUIRED=true`.

### Meetings (meetings.codeqlick.com)

Video meetings by link (architecture 4.8 and 6.3), served by the same web and API containers.
Calls use the video chat's coturn, so the video chat is set up first. **One command**, safe to
run again:

```bash
cd /srv/codeqlick
sudo ./deploy/setup-meetings.sh
```

It creates the DNS record through OVH's API, sets `MEETINGS_URL` in `.env`, installs
`deploy/nginx/meetings.codeqlick.com.conf`, gets the certificate once the DNS answers, releases and
checks. Then open https://meetings.codeqlick.com, sign in, create a room and open its link on
another device (one on mobile data checks TURN).

### Web app subdomains (automatic)

Codeqlick's own web apps (the API's `WEBAPPS`, in `codeqlick-backend/src/common/webapps.ts`)
each live on `<app>.codeqlick.com`. After a one-time setup, a release publishes the subdomain of
any new app by itself: add the app to `WEBAPPS`, merge, done. One command, as a user with sudo:

```bash
cd /srv/codeqlick
sudo ./deploy/setup-webapps.sh
```

It installs `deploy/webapp-site.sh` as root at `/usr/local/sbin/codeqlick-webapp-site` and adds
`/etc/sudoers.d/codeqlick-webapps`, which lets the deploy user run that file (and nothing else)
with sudo. Then it publishes every app still missing. From then on, `deploy/deploy.sh` runs the
helper after each release for any app whose Nginx site has no certificate yet: it creates the DNS
`A` record through OVH's API (never changing an existing record that points elsewhere), writes the
Nginx site from its own template (pages to the web, `/ws` to the API's `/v1/<app>/ws`), and gets
the certificate once the DNS answers. A failure there never fails the release; the next one tries
again. Run `setup-webapps.sh` again after changing `webapp-site.sh`, since the installed copy is
root's. An app that needs its own settings (keys, secrets) still gets them in `.env`.

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
- Settings from GitHub: the workflow also sends the Actions secrets `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY` on the release's standard input, and `deploy/ci-deploy.sh` writes them to
  `.env` (only those names, only plain values, empty ones ignored) before releasing. Changing them
  in GitHub and running the workflow is enough; nothing is typed on the server.

### Turnstile (anti-bot on sign-up and sign-in)

Cloudflare Turnstile is free and needs no Cloudflare DNS (architecture 4.3, decision 28):

1. In the Cloudflare dashboard → Turnstile → Add widget: name `Codeqlick`, hostname
   `codeqlick.com` (it covers the web apps' subdomains), mode Managed.
2. In GitHub → Settings → Secrets and variables → Actions, add `TURNSTILE_SITE_KEY` (the site
   key) and `TURNSTILE_SECRET_KEY` (the secret key).
3. Run Actions → Deploy → Run workflow. The release writes both to `.env`; `/login` and
   `/register` show the widget and the API checks every token.

To turn it off, empty both lines of `.env` (as the deploy user) and release with
`./deploy/deploy.sh --no-pull`, then delete the two secrets.

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

Swipe's private photos (swipe.codeqlick.com) live in the `codeqlick-prod_swipe-data` volume and are
**not** backed up on purpose: a removed or deleted intimate photo must not survive in a backup. Losing
the volume loses those photos; their rows stay and the photos show as missing.

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

### Nginx hardening

Nginx must not show its version (`Server: nginx`, not `nginx/1.28.3 (Ubuntu)`) on any site of the
server, client sites included. Ubuntu's `/etc/nginx/nginx.conf` already sets `server_tokens` in
its `http` block (to `build`, the full version), so it is changed there, not added in `conf.d`
(a second `server_tokens` makes `nginx -t` fail):

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sudo sed -i 's/^\(\s*\)server_tokens [a-z]*;/\1server_tokens off;/' /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://codeqlick.com/en | grep -i '^server'   # server: nginx
```

### Monitoring

`deploy/monitor/monitor.sh` runs from the deploy user's crontab every 5 minutes. It checks:

- the public site and API (through Nginx and TLS);
- the Docker health of `db`, `api`, `web`, `backup`, `umami` and `site-builder`, plus `cloud-pg` and `cloud-storage` when `COMPOSE_PROFILES` includes `cloud-data` (`backup` is unhealthy without a dump from the last two days);
- disk use (alerts at 85 %, `MONITOR_DISK_LIMIT`). Below `CLOUD_DISK_MIN_GB` free (15 GB) Codeqlick Cloud also stops growing on its own: architecture 4.13 "Disk guard";
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

## Staging

A second copy of the website and API on the same server, to try a branch before it reaches
production: https://staging.codeqlick.com, behind the team's password. It runs from its own
checkout (`/srv/codeqlick-staging`) as the `codeqlick-staging` Compose project
(`docker-compose.staging.yml`): its own database, API and website on `127.0.0.1:3011`/`4011`, and
Mailpit, which keeps every email instead of sending it (inbox at https://staging.codeqlick.com/mail/).
Stripe, OVH, Umami, the site builder and the video chat are off.

### Put a branch on staging

Actions → **Staging** → Run workflow, with the branch. Tick **With data** to first replace
staging's data with production's newest backup (`/srv/codeqlick/backups`) and uploaded files: the
way to see a migration run on real data before merging. That copy loses everyone's sessions, their
two-step verification (staging doesn't ask for it) and the clients' stored access. Passwords are
the same as in production.

On the server, as the deploy user, the same thing:

```bash
cd /srv/codeqlick-staging
./deploy/staging.sh my-branch               # or: ./deploy/staging.sh my-branch --with-data
```

### One-time setup

1. **DNS:** an `A` record (and `AAAA` if the others have one) for `staging.codeqlick.com` pointing
   at the server, like `codeqlick.com`.
2. **Checkout and settings** (deploy user):

   ```bash
   git clone https://github.com/Codeqlick/Codeqlick.git /srv/codeqlick-staging
   cd /srv/codeqlick-staging
   cp deploy/.env.staging.example .env && chmod 600 .env
   nano .env      # new secrets: openssl rand -hex 24 / openssl rand -base64 48
   ./deploy/staging.sh
   ```

3. **Nginx, password and TLS** (root):

   ```bash
   sudo apt install apache2-utils     # for htpasswd, if missing
   sudo htpasswd -c /etc/nginx/staging.htpasswd codeqlick
   sudo chown root:www-data /etc/nginx/staging.htpasswd && sudo chmod 640 /etc/nginx/staging.htpasswd
   sudo cp /srv/codeqlick-staging/deploy/nginx/staging.codeqlick.com.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/staging.codeqlick.com.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d staging.codeqlick.com
   ```

4. **The workflow** needs nothing more: it uses the deploy key, whose `deploy/ci-deploy.sh` reads
   `staging <branch> [--with-data]` and runs the script in `/srv/codeqlick-staging` (it refuses
   anything else). Keep `/srv/codeqlick` on a `main` that has this version of `ci-deploy.sh`.

The staging containers use memory and disk while they run. Stop them when not needed:
`docker compose -f docker-compose.staging.yml down` (add `-v` to also delete staging's data).

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

## Codeqlick Cloud: builds from Git

Builds from Git (architecture 4.13, 8.4) need a GitHub App and the build agent, which for now
runs on this VPS with every build sandboxed (decision 41). Until both exist, the Git tab says it
isn't set up and nothing else changes.

### 1. The GitHub App

In GitHub → the **Codeqlick** organisation → Settings → Developer settings → GitHub Apps → **New
GitHub App**:

| Setting | Value |
|---|---|
| Name | `Codeqlick Cloud` (its slug, e.g. `codeqlick-cloud`, goes in `GITHUB_APP_SLUG`) |
| Homepage URL | `https://cloud.codeqlick.com` |
| Callback URL | `https://cloud.codeqlick.com/github/setup` |
| Request user authorization (OAuth) during installation | **on** |
| Setup URL | (greyed out with the above: GitHub uses the callback) |
| Webhook | active, URL `https://api.codeqlick.com/v1/cloud/github/webhook`, a secret (`openssl rand -hex 32`) |
| Repository permissions | Contents: Read-only · Metadata: Read-only · Pull requests: Read and write · Commit statuses: Read and write |
| Subscribe to events | Push · Pull request (installation events are always sent) |
| Where can it be installed | Any account |

Then: note the **App ID** and the **Client ID**, generate a **client secret** and a **private key**
(a `.pem` file), and add to `/srv/codeqlick/.env`:

```bash
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=codeqlick-cloud
GITHUB_APP_CLIENT_ID=Iv23li…
GITHUB_APP_CLIENT_SECRET=…
GITHUB_APP_WEBHOOK_SECRET=…            # the webhook's secret
GITHUB_APP_PRIVATE_KEY="$(awk 'NF {printf "%s\\n", $0}' codeqlick-cloud.private-key.pem)"
CLOUD_BUILDER_TOKEN=$(openssl rand -hex 32)
```

(the private key goes on one line with `\n`; the command above writes it so) and recreate the API:
`docker compose -f docker-compose.prod.yml up -d api`.

### 2. The build agent

For now it runs **on this VPS** (decision 41): every build runs under gVisor (`runsc`, a
user-space kernel), on Docker's default bridge, and a firewall (`deploy/builder/firewall.sh`)
drops everything from that bridge to the host and to private networks, so a build only reaches
the internet. Docker is **reloaded**, not restarted, to add the runtime: the running containers
(this project's and the others') keep running. As root:

```bash
sudo bash /srv/codeqlick/deploy/builder/setup-builder.sh
journalctl -u codeqlick-builder -f        # "claiming builds from … (runtime: runsc)"
```

It clones the agent from `/srv/codeqlick` into `/opt/codeqlick-builder`, copies
`CLOUD_BUILDER_TOKEN` from `.env` into `/etc/codeqlick-builder.env`, and starts the agent only
after a sandboxed container has reached npm and failed to reach the host. To update the agent
after a deploy that changes it: `sudo /opt/codeqlick-builder/update.sh`.

**Moving to a dedicated server** later (2 vCPU, 4 GB, 40 GB, Ubuntu, only SSH open) is the same
script: add a read-only deploy key of that server to the repository, then
`git clone git@github.com:Codeqlick/Codeqlick.git /opt/codeqlick-builder` and
`sudo bash /opt/codeqlick-builder/deploy/builder/setup-builder.sh`, put the token in
`/etc/codeqlick-builder.env`, `sudo systemctl restart codeqlick-builder`, and on this VPS
`sudo systemctl disable --now codeqlick-builder`.

## Public documentation (docs.codeqlick.com)

The documentation site (`codeqlick-docs/`, architecture 4.13 and decision 53) is a static site that
Codeqlick Cloud itself builds and hosts, from this repository. The Deploy workflow doesn't touch
it, and `.github/workflows/docs.yml` only gates pull requests. Until the steps below are done
nothing changes: the console keeps its own `/docs` page. Run them once, in order, after the pull
request is merged and deployed:

1. **Create the project.** In the console (cloud.codeqlick.com) open the Codeqlick team and create
   a project with the slug `codeqlick-docs` (`docs` itself is reserved).
2. **Connect the repository.** In the project's Git tab connect this repository (the GitHub App
   must be installed on it, see "Codeqlick Cloud: builds from Git") and set: root folder
   `codeqlick-docs`, install `npm ci`, build `npm run build`, output `dist`, Node 24, production
   branch `main`, "build other branches" off and "build pull requests" off (CI already builds
   every pull request; a Cloud preview for each would only cost builds).
3. **Allow the domain.** On the server, edit `/srv/codeqlick/.env`:

   ```
   CLOUD_PLATFORM_TEAM_ID=<the Codeqlick team's id>
   CLOUD_PLATFORM_DOMAINS=docs.codeqlick.com
   ```

   The first is the id (not the slug) of the Codeqlick team: read it from `GET /v1/cloud/me`
   (`teams[].id`, with an API token or session) or with `SELECT id FROM cloud_teams WHERE slug =
   'codeqlick';` in psql. The second is a comma-separated list of exact domains. Then recreate the API:

   ```bash
   cd /srv/codeqlick && docker compose -f docker-compose.prod.yml up -d api
   ```

4. **DNS.** At OVH (DNS zone of `codeqlick.com`) add the `A` record `docs.codeqlick.com` pointing
   to `SITES_SERVER_IP` (the same address the other Cloud and client-site records use).
5. **Add and verify the domain.** In the project's Domains tab add `docs.codeqlick.com`, create
   the TXT record the console shows, then press "Check now". When it is verified, the cron of
   `sync-sites.sh` publishes it with its own certificate (`cq-site add docs.codeqlick.com cloud
   codeqlick-docs`) within a few minutes.
6. **Point the console at it.** Set `CLOUD_DOCS_URL=https://docs.codeqlick.com` in
   `/srv/codeqlick/.env` and recreate the web service:

   ```bash
   cd /srv/codeqlick && docker compose -f docker-compose.prod.yml up -d web
   ```

   `/cloud/docs` then redirects to the documentation site and the console, landing and emails link
   there. To go back, empty the variable and recreate `web`.

Check: `curl -sI https://docs.codeqlick.com/en/` answers `200` and
`https://docs.codeqlick.com/sitemap-index.xml` exists.

### Publishing a draft page

Pages of features that haven't merged are `draft: true` in their front matter, in both languages
(`src/content/docs/en/...` and `.../es/...`), and the site neither builds nor lists them. When the
feature has merged and runs in production, remove `draft: true` from both files in the same pull
request; merging to `main` publishes the page. CI fails if one language has no twin.

## Other domains of the brand

Domains registered only to protect the brand (e.g. `codeqlick.es`) send every visit to
https://codeqlick.com with a permanent redirect that keeps the path. Once the domain is
registered at OVH with the team's account:

```bash
cd /srv/codeqlick && sudo ./deploy/setup-redirect.sh codeqlick.es
```

It points `@` and `www` at the server through OVH's API (replacing OVH's parking records; MX and
the rest stay), adds the Nginx site `redirect-<domain>.conf` and gets the certificate for both
names. Safe to run again; if the names don't resolve here yet, run it again a few minutes later.

## Codeqlick Cloud

Developers' static sites (architecture 4.13 and 8.3) are served from `/srv/codeqlick/cloud`
under a hosting domain of their own (`CLOUD_HOSTING_DOMAIN`, decision 33: never codeqlick.com).
The console (cloud.codeqlick.com) is a web app and publishes itself; **deploying stays off**
(the API answers 503) until this one-time setup is done.

1. Register the hosting domain (e.g. `codeqlick.app`) at OVH with the team's account, so its DNS
   zone is there and the API keys in `.env` can change it (`GET/POST/PUT/DELETE /domain/zone/*`).
2. Install the newer `cq-site` (it learnt the `cloud` kind for custom domains):

   ```bash
   sudo install -o root -g root -m 755 /srv/codeqlick/deploy/sites/cq-site /usr/local/sbin/cq-site
   ```

3. Run the setup with the domain:

   ```bash
   cd /srv/codeqlick && sudo ./deploy/setup-cloud.sh codeqlick.app
   docker compose -f docker-compose.prod.yml up -d api
   ```

   It adds the `@` and `*` A records, creates the folders (owned by the API container's user,
   1000:1000) and their pages, gets the wildcard certificate through OVH's DNS
   (`python3-certbot-dns-ovh`; renewed by certbot's timer), installs the Nginx site, lets the API's
   site take 50 MB deployments, and saves `CLOUD_HOSTING_DOMAIN` in `.env`. Safe to run again.

Custom domains of Cloud projects are published by the same cron as client sites
(`sync-sites.sh`, through `cq-site add <domain> cloud <slug>`) once the API has verified them.
Deployments are not backed up: developers keep their sources and deploy again. To take a project
down, suspend it in Admin → Cloud.

### Password protection

A project can ask visitors for a password on its deployment addresses, or on everything (production
and custom domains too); architecture 4.13 "Password protection", 8.3 and decision 50. Nginx
enforces it with `auth_request` (`deploy/nginx/cloud-protection.conf`, included by the hosting site
and by every `cq-site … cloud` site): unprotected projects are answered from a marker-file check in
`cloud/protect/` (and, since `codeqlick.json` rules, a deployment's `.cq-rules`) and never reach the
API; protected ones, or those with rules, ask the API (`/v1/cloud/edge/check`, formerly
`/v1/cloud/protection/check`, on 127.0.0.1, with `CLOUD_PROTECTION_KEY`) and keep each answer 60 s. Until the steps below are
done, the API answers 503 when someone tries to turn it on. Once, as a user with sudo:

1. Run the setup again (the same domain). It creates `CLOUD_PROTECTION_KEY` in `.env` when it is
   missing, writes it for Nginx in `/etc/nginx/cq-cloud-protection-key.conf` (root, 600), installs
   the snippet as `/etc/nginx/snippets/cq-cloud-protection.conf` and the headers of `codeqlick.json`
   rules as `/etc/nginx/snippets/cq-cloud-rule-headers.conf`, creates `cloud/protect/` and the
   cache `/var/cache/nginx/cq-protect`, renders the hosting site again, makes the API's site answer
   404 for `/v1/cloud/protection/` and `/v1/cloud/edge/` and reloads Nginx. It stops if this Nginx lacks
   `ngx_http_auth_request_module` (Ubuntu's package has it: `nginx -V 2>&1 | grep -o auth_request`).

   ```bash
   cd /srv/codeqlick && sudo ./deploy/setup-cloud.sh codeqlick.app
   docker compose -f docker-compose.prod.yml up -d api
   ```

   The new snippet calls `/v1/cloud/edge/check`; the API keeps `/v1/cloud/protection/check` as an
   alias for one release, so the order in which this and the password-protection release are
   deployed doesn't matter.

2. Install the newer `cq-site` (it includes the snippet and the rule headers in `cloud` sites,
   routes `try_files` through `$cq_path`, and refuses to write one without the snippets), then add each existing custom domain again so its site includes it too (the
   certificate is reused; `sync-sites.sh` only does this for new domains). Do it right after step 1:
   until it is done, the custom domains of a project set to "everything" are **not** protected
   (its `<slug>.codeqlick.app` addresses are):

   ```bash
   sudo install -o root -g root -m 755 /srv/codeqlick/deploy/sites/cq-site /usr/local/sbin/cq-site
   for f in /srv/codeqlick/cloud/domains/*; do
     [ -f "$f" ] && sudo cq-site add "$(basename "$f")" cloud "$(head -n 1 "$f")"
   done
   grep -L cq-cloud-protection /etc/nginx/sites-available/cq-site-*.conf  # Cloud domains must not be listed
   sudo nginx -t
   ```

   (The `grep -L` also lists client sites of the `static` and `proxy` kinds; they don't use it.)

3. Check it: `curl -sI https://<slug>.codeqlick.app/` answers as before for an unprotected project;
   turn protection on for a test project (console → Settings → Password protection) and the same
   request answers `302` to `/__codeqlick/password?next=/`; that page loads, and the right password
   lets you in. `curl -s -o /dev/null -w '%{http_code}\n' https://api.codeqlick.com/v1/cloud/protection/check`
   prints `404`, and so does `.../v1/cloud/edge/check`.

### Redirects, rewrites and headers (`codeqlick.json`)

Architecture 4.13 and 8.3, decision 52. The same single `auth_request` as password protection: the
check answers `204` at once unless the project is protected or the deployment has a `.cq-rules`
marker, so sites with neither never reach the API. Otherwise the API's answer carries the redirect
(`403` + `X-Cq-Status`/`X-Cq-Location`, returned by `@cq_redirect`), the file to serve
(`X-Cq-Path`, used by `try_files $cq_path ...`; `/.cq-none` when no file answers) and the headers to
add (`X-Cq-H-<name>`, added by `/etc/nginx/snippets/cq-cloud-rule-headers.conf`, one line per name
of the fixed list: keep it in step with the API's list). A rule's `Cache-Control` replaces the
one-year default of hashed assets. Nothing is set up beyond the steps of "Password protection" above
(run `setup-cloud.sh` again, reinstall `cq-site`, add the custom domains again); there is no new
environment variable. Until a custom domain's site is added again it keeps its old `try_files`, so
rules and headers don't apply to it (its protection does).

Check it on the server after those steps (replace the address of a test project that has a
deployment with `{"redirects":[{"source":"/old","destination":"/new"}],"headers":[{"source":"/*","headers":{"X-Frame-Options":"DENY"}}]}`):

```bash
sudo nginx -t
curl -sI https://<slug>.codeqlick.app/old | grep -iE '^(HTTP|location)'     # 308, Location: https://<slug>.codeqlick.app/new
curl -sI https://<slug>.codeqlick.app/ | grep -iE '^(HTTP|x-frame-options)' # 200, DENY
curl -sI https://<other-slug>.codeqlick.app/ | grep -ic x-frame-options     # a project without rules: 0
```

If you ever change `CLOUD_PROTECTION_KEY` in `.env`, run step 1 again so Nginx sends the new one,
and recreate the API. If the API is down, protected addresses answer 500 (never their files);
unprotected ones are unaffected.

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

### Codeqlick Cloud's PRO plan (Stripe)

Teams pay PRO through a Stripe subscription (architecture 4.13 "Plans and billing", decision 46),
with the same account and keys as above. It is off until `STRIPE_CLOUD_PRO_PRICE_ID` is set too:

1. Product catalogue → Add product "Codeqlick Cloud PRO" with a **recurring monthly** price
   (before VAT: the API adds the "IVA" tax rate). Copy the price's id (`price_…`).
2. Settings → Billing → Customer portal: activate it, allow updating payment methods, viewing
   invoices and canceling **at the end of the period**.
3. The webhook endpoint of step 3 above also gets `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.payment_failed`.
4. `STRIPE_CLOUD_PRO_PRICE_ID=price_…` in `/srv/codeqlick/.env`, then recreate the API.
### Codeqlick Cloud's databases (cloud-pg)

Managed PostgreSQL for projects (architecture 4.13 "Databases", decision 47) runs, for now, on
this server in its own container, `cloud-pg` (not the platform's `db`), published on port 5432
with TLS only. It uses the hosting domain's wildcard certificate (`*.codeqlick.app`, from
`setup-cloud.sh`), so developers connect to `pg.codeqlick.app`, which the wildcard DNS record
already points here. To switch it on, as `cqadmin` in `/srv/codeqlick`:

1. Add to `.env` (the password: `openssl rand -hex 32`):

   ```bash
   COMPOSE_PROFILES=cloud-data
   CLOUD_PG_PASSWORD=…
   CLOUD_PG_HOST=pg.codeqlick.app
   ```

2. `docker compose -f docker-compose.prod.yml up -d` (or deploy): it starts `cloud-pg` and
   `cloud-pg-backup` and gives the API the settings.
3. Check from outside: `psql "postgresql://x@pg.codeqlick.app:5432/x?sslmode=require"` must
   answer about the password (not time out); a connection without TLS must be refused.

Each project database is a database and a role `cq_<16 hex>`. Teams get them with the password
shown once. They are dumped daily to `backups/cloud-pg/` (7 days). To restore one:
`docker compose -f docker-compose.prod.yml exec -T cloud-pg pg_restore -U cqadmin --clean
--if-exists -d cq_… < backups/cloud-pg/cq_…-<date>.dump`.

### Codeqlick Cloud's object storage (Garage)

S3-compatible buckets for projects (architecture 4.13 "Object storage", decision 48) are served,
for now on this server, by [Garage](https://garagehq.deuxfleurs.fr/) in the `cloud-storage`
service (one node; data in the `cloud-storage-data` volume). Its S3 API is published at
`https://s3.codeqlick.app` by Nginx with the hosting wildcard certificate. To switch it on:

1. Add to `/srv/codeqlick/.env` (each secret: `openssl rand -hex 32`; `cloud-data` is the same
   profile as the databases):

   ```bash
   COMPOSE_PROFILES=cloud-data
   CLOUD_STORAGE_RPC_SECRET=…
   CLOUD_STORAGE_ADMIN_TOKEN=…
   CLOUD_STORAGE_ENDPOINT=https://s3.codeqlick.app
   ```

2. `docker compose -f docker-compose.prod.yml up -d` (or deploy) as `cqadmin`.
3. `sudo ./deploy/setup-storage.sh` installs the Nginx site and reloads Nginx.
4. The API gives the node its layout the first time a bucket is made (`CLOUD_STORAGE_CAPACITY_GB`,
   100 by default). Check: `curl -sI https://s3.codeqlick.app` answers `403` from Garage.

Buckets have Garage quotas from the team's plan; keys reach one bucket each. Objects aren't
backed up yet: the console says so.

### Publishing

```bash
deploy/sites/publish-site.sh peluqueria peluqueria.demo.codeqlick.com ../web-basica examples/peluqueria
deploy/sites/publish-site.sh peluqueria-marta peluqueriamarta.es ../peluqueria-marta
```

Each run is a release; to roll back, point `current` at an older folder in `releases/`. To take a
site down: `sudo cq-site remove <domain>` and delete its folder. On the server,
`sudo cq-site list` shows the published domains. Turn on the project's uptime monitoring and its
site form in the admin panel.
