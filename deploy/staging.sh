#!/bin/sh
# Puts a branch (or tag, or commit) on staging: run on the server from /srv/codeqlick-staging as the
# deploy user (deploy/README.md, "Staging").
#
#   ./deploy/staging.sh                       rebuild what is checked out
#   ./deploy/staging.sh my-branch             fetch and check out origin/my-branch, then rebuild
#   ./deploy/staging.sh my-branch --with-data also replace staging's data with production's
#                                             newest backup (the way to try a migration)
#
# --with-data restores /srv/codeqlick/backups' newest dump and uploaded files, then takes out what
# must not work outside production: everyone's sessions and authenticator (two-step sign-in), and
# the stored client credentials (encrypted with production's key, unreadable here anyway).
# Exits non-zero when staging is not serving.
set -eu

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.staging.yml"
SERVICES="db api web"
BACKUPS="${PRODUCTION_BACKUPS:-/srv/codeqlick/backups}"

setting() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1; }
WEB_PORT="$(setting WEB_PORT)"
API_PORT="$(setting API_PORT)"
WEB_PORT="${WEB_PORT:-3011}"
API_PORT="${API_PORT:-4011}"

log() { printf '\n==> %s\n' "$*"; }

ref=""
with_data=false
for arg in "$@"; do
  case "$arg" in
    --with-data) with_data=true ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) ref="$arg" ;;
  esac
done

if [ -n "$ref" ]; then
  # Branch, tag or commit names only: nothing a shell or git could read as an option.
  if ! printf '%s' "$ref" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$'; then
    echo "Not a valid branch name: $ref" >&2
    exit 2
  fi
  log "Fetching $ref"
  git fetch --prune origin
  if git rev-parse --verify --quiet "origin/$ref^{commit}" > /dev/null; then
    git checkout --quiet --detach "origin/$ref"
  else
    git checkout --quiet --detach "$ref^{commit}"
  fi
  # Go on with that branch's own version of this script.
  if [ "$with_data" = true ]; then exec ./deploy/staging.sh --with-data; fi
  exec ./deploy/staging.sh
fi
log "Staging $(git log --oneline -1)"

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

verify() {
  attempts=0
  until all_healthy && serving; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 36 ] && return 1
    sleep 5
  done
}

log "Building images"
$COMPOSE build

if [ "$with_data" = true ]; then
  dump="$(find "$BACKUPS" -maxdepth 1 -name 'codeqlick-*.dump' | sort | tail -n 1)"
  [ -n "$dump" ] || { echo "No dump in $BACKUPS" >&2; exit 1; }
  log "Replacing staging's data with $(basename "$dump")"
  # The API stays down while the data changes; it applies this branch's migrations on start.
  $COMPOSE stop api web 2> /dev/null || true
  $COMPOSE up -d --wait db
  $COMPOSE exec -T db pg_restore --clean --if-exists --no-owner -U codeqlick -d codeqlick < "$dump"
  $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U codeqlick -d codeqlick <<'SQL'
DELETE FROM sessions;
UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
  totp_recovery_hashes = '{}';
SQL
  # Optional tables: only when the dump has them.
  $COMPOSE exec -T db psql -U codeqlick -d codeqlick -c 'DELETE FROM project_credentials;' 2> /dev/null || true
  if [ -d "$BACKUPS/uploads" ]; then
    $COMPOSE create api > /dev/null
    $COMPOSE cp "$BACKUPS/uploads/." api:/app/uploads/
  fi
fi

log "Starting"
$COMPOSE up -d || true

log "Waiting for the database, API and website"
if ! verify; then
  log "Not serving yet: starting again"
  $COMPOSE up -d || true
  if ! verify; then
    log "STAGING FAILED: not serving"
    $COMPOSE ps -a
    $COMPOSE logs --tail 60 api web
    exit 1
  fi
fi

log "Serving $(git log --oneline -1)"
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
docker image prune -f > /dev/null
