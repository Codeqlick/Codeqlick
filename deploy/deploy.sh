#!/bin/sh
# Releases what is on `main`: run on the server from /srv/codeqlick as the deploy user.
#
#   ./deploy/deploy.sh             pull, build, restart, verify
#   ./deploy/deploy.sh --no-pull   rebuild and restart the current checkout
#
# Images are built while the old containers keep serving, so downtime is limited to the restart.
# Afterwards every service must report healthy and the site and API must answer; if not, the stack
# is started once more (a failed container replacement is the usual cause) and checked again.
# Exits non-zero when the release is not serving.
set -eu

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
SERVICES="db api web backup site-builder"

# Ports as configured in .env, with the same defaults as docker-compose.prod.yml.
setting() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1; }
WEB_PORT="$(setting WEB_PORT)"
API_PORT="$(setting API_PORT)"
WEB_PORT="${WEB_PORT:-3010}"
API_PORT="${API_PORT:-4010}"

log() { printf '\n==> %s\n' "$*"; }

all_healthy() {
  for service in $SERVICES; do
    $COMPOSE ps --format '{{.Service}} {{.Health}}' "$service" 2>/dev/null | grep -q "^$service healthy$" ||
      return 1
  done
}

serving() {
  curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:$WEB_PORT/en" &&
    curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:$API_PORT/v1/health"
}

# Waits up to three minutes for every service to be healthy and both endpoints to answer.
verify() {
  attempts=0
  until all_healthy && serving; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 36 ] && return 1
    sleep 5
  done
}

if [ "${1:-}" != "--no-pull" ]; then
  log "Pulling main"
  git fetch origin main
  if ! git merge --ff-only FETCH_HEAD; then
    # main's history was rewritten (only commit messages changed): find the new main's commit with
    # exactly the files checked out, move onto it and fast-forward from there. Refuse anything else.
    tree="$(git rev-parse 'HEAD^{tree}')"
    same="$(git log --format='%H %T' FETCH_HEAD | awk -v t="$tree" '$2 == t { print $1; exit }')"
    if [ -n "$same" ]; then
      log "main's history was rewritten: following it from $(git log --oneline -1 "$same")"
      git reset --hard "$same"
      git merge --ff-only FETCH_HEAD
    else
      log "main can't be fast-forwarded and no commit of it has these files: not releasing"
      exit 1
    fi
  fi
fi
log "Releasing $(git log --oneline -1)"

log "Building images (the running containers keep serving)"
$COMPOSE build

# coturn's Compose profile was called `videochat` while the video chat existed; the relay now
# serves Meetings only and its profile is `turn`. Renamed in .env so it keeps running.
if grep -Eq '^COMPOSE_PROFILES=.*(=|,)videochat(,|$)' .env 2>/dev/null; then
  log "Renaming the coturn profile in .env (videochat -> turn)"
  sed -i -E '/^COMPOSE_PROFILES=/ s/(=|,)videochat(,|$)/\1turn\2/' .env
fi

log "Starting the new containers"
$COMPOSE up -d || true

log "Waiting for every service to be healthy and the site and API to answer"
if ! verify; then
  log "Not serving yet: starting the stack again"
  $COMPOSE up -d || true
  if ! verify; then
    log "RELEASE FAILED: the site is not serving"
    $COMPOSE ps -a
    $COMPOSE logs --tail 40 api web
    exit 1
  fi
fi

log "Serving"
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
docker image prune -f > /dev/null

# Web apps whose subdomain isn't published yet (their Nginx site has no certificate), and the
# account site (account.codeqlick.com, decision 108): the helper that deploy/setup-webapps.sh
# installs adds the DNS record, the site and the certificate. It never fails the release; the next
# one tries again.
for app in $(./deploy/webapps.sh) account; do
  grep -qs ssl_certificate "/etc/nginx/sites-enabled/$app.codeqlick.com.conf" && continue
  log "Publishing $app.codeqlick.com"
  sudo -n /usr/local/sbin/codeqlick-webapp-site "$app" ||
    echo "Warning: $app.codeqlick.com isn't published yet (if the error is about sudo, run sudo ./deploy/setup-webapps.sh once)."
done
