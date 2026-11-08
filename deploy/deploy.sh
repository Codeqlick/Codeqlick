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
  git pull --ff-only
fi
log "Releasing $(git log --oneline -1)"

log "Building images (the running containers keep serving)"
$COMPOSE build

# Web Push keys (video chat and Swipe notifications): made once with the new API image's web-push
# and kept in .env, so the containers started below already have them. Never fails the release.
if [ -z "$(setting VAPID_PUBLIC_KEY)" ] || [ -z "$(setting VAPID_PRIVATE_KEY)" ]; then
  log "Creating the VAPID keys for notifications"
  keys="$($COMPOSE run --rm --no-deps -T api node --input-type=module \
    -e "import w from 'web-push'; const k = w.generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey)" \
    2>/dev/null | tail -n 1)" || keys=""
  public="${keys%% *}"
  private="${keys##* }"
  if printf '%s' "$public" | grep -Eq '^[A-Za-z0-9_-]{80,}$' &&
    printf '%s' "$private" | grep -Eq '^[A-Za-z0-9_-]{40,}$'; then
    for name in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do
      sed -i "/^$name=/d" .env
    done
    printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n' "$public" "$private" >>.env
    echo "VAPID keys saved in .env."
  else
    echo "Warning: couldn't make the VAPID keys; notifications stay off until the next release."
  fi
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

# Web apps whose subdomain isn't published yet (their Nginx site has no certificate): the helper
# that deploy/setup-webapps.sh installs adds the DNS record, the site and the certificate. It never
# fails the release; the next one tries again.
for app in $(./deploy/webapps.sh); do
  grep -qs ssl_certificate "/etc/nginx/sites-enabled/$app.codeqlick.com.conf" && continue
  log "Publishing $app.codeqlick.com"
  sudo -n /usr/local/sbin/codeqlick-webapp-site "$app" ||
    echo "Warning: $app.codeqlick.com isn't published yet (if the error is about sudo, run sudo ./deploy/setup-webapps.sh once)."
done
