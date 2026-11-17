#!/usr/bin/env bash
# Publishes Neoqlick's hosts (architecture 4.18, decisions 124-131): the Nginx sites and the Let's
# Encrypt certificates of neoqlick.com (+ www), account., api., stats., cruising., swipe. and
# videochat.neoqlick.com. Run it once from /srv/codeqlick, as a user with sudo, after the release
# that brings Neoqlick is on the server (deploy/README.md, "Neoqlick cut-over"):
#
#   sudo ./deploy/setup-neoqlick.sh             # does it
#   ./deploy/setup-neoqlick.sh --dry-run        # checks the DNS and lists what it would do; changes nothing
#   ./deploy/setup-neoqlick.sh --render DIR     # only writes the rendered Nginx sites into DIR (to inspect or `nginx -t`)
#
#   1. Checks that every host resolves to SITES_SERVER_IP (.env). It does NOT touch the DNS: the
#      records are created beforehand (OVH's manager or API). Fails, naming the hosts, if not.
#   2. Writes each Nginx site from deploy/nginx/*.conf.template (pages to the web, /ws and api. to
#      the API), checks `nginx -t` and removes the new sites again if Nginx refuses them. An existing
#      site is never changed.
#   3. Gets a certificate for each site with `certbot --nginx` (once the DNS answers).
#
# It never touches the old <app>.codeqlick.com sites (deploy/neoqlick-cutover.sh does, later) nor any
# other project's. Safe to run again: every step checks first.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TEMPLATES="$ROOT/deploy/nginx"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
AVAILABLE_DIR="${NGINX_AVAILABLE_DIR:-/etc/nginx/sites-available}"
ENABLED_DIR="${NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
LE_DIR="${LETSENCRYPT_DIR:-/etc/letsencrypt}"
ZONE=neoqlick.com

DRY_RUN=0
RENDER_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --render)
      shift
      RENDER_DIR="${1:-}"
      [ -n "$RENDER_DIR" ] || {
        echo "Error: --render needs a directory" >&2
        exit 1
      }
      ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Error: unknown option $1 (see --help)" >&2
      exit 1
      ;;
  esac
  shift
done

log() { printf '\n==> %s\n' "$*"; }
fail() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}
# Values from .env, read as plain text (never sourced).
setting() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1; }

# The sites: "<conf name>|<template>|<app>|<names for the certificate>" (the first name is the
# certificate's). The apps' names are the keys of the API's NEOQLICK_APPS.
SITES=(
  "neoqlick.com|neoqlick.com.conf.template||neoqlick.com www.neoqlick.com"
  "account.neoqlick.com|neoqlick-account.conf.template||account.neoqlick.com"
  "api.neoqlick.com|api.neoqlick.com.conf.template||api.neoqlick.com"
  "stats.neoqlick.com|stats.neoqlick.com.conf.template||stats.neoqlick.com"
  "cruising.neoqlick.com|neoqlick-app.conf.template|cruising|cruising.neoqlick.com"
  "swipe.neoqlick.com|neoqlick-app.conf.template|swipe|swipe.neoqlick.com"
  "videochat.neoqlick.com|neoqlick-app.conf.template|videochat|videochat.neoqlick.com"
)

if [ -f "$ENV_FILE" ]; then
  WEB_PORT="$(setting WEB_PORT)"
  API_PORT="$(setting API_PORT)"
  UMAMI_PORT="$(setting UMAMI_PORT)"
else
  [ -n "$RENDER_DIR" ] || fail "run it from /srv/codeqlick (there is no .env here)"
  WEB_PORT="" API_PORT="" UMAMI_PORT=""
fi
WEB_PORT="${WEB_PORT:-3010}"
API_PORT="${API_PORT:-4010}"
UMAMI_PORT="${UMAMI_PORT:-3020}"
for port in "$WEB_PORT" "$API_PORT" "$UMAMI_PORT"; do
  [[ "$port" =~ ^[0-9]{2,5}$ ]] || fail "WEB_PORT, API_PORT and UMAMI_PORT in .env must be ports"
done

# Writes the site <conf name> to stdout, from its template.
render() {
  local template="$1" app="$2" host="$3"
  local file="$TEMPLATES/$template"
  [ -f "$file" ] || fail "missing $file"
  local upload="$TEMPLATES/neoqlick-cruising-upload.conf.inc"
  # The marker line `#@UPLOAD@` becomes Cruising's 100 MB route, and disappears elsewhere.
  awk -v upload="$upload" -v app="$app" '
    /^#@UPLOAD@$/ {
      if (app == "cruising") { while ((getline line < upload) > 0) print line }
      next
    }
    { print }' "$file" |
    sed -e "s|@HOST@|$host|g" -e "s|@APP@|$app|g" \
      -e "s|@WEB_PORT@|$WEB_PORT|g" -e "s|@API_PORT@|$API_PORT|g" -e "s|@UMAMI_PORT@|$UMAMI_PORT|g"
}

if [ -n "$RENDER_DIR" ]; then
  mkdir -p "$RENDER_DIR"
  for entry in "${SITES[@]}"; do
    IFS='|' read -r name template app _ <<<"$entry"
    render "$template" "$app" "$name" >"$RENDER_DIR/$name.conf"
    if grep -q '@[A-Z_]*@' "$RENDER_DIR/$name.conf"; then fail "$name.conf has a placeholder left"; fi
    echo "Wrote $RENDER_DIR/$name.conf"
  done
  exit 0
fi

if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then exec sudo "$SELF" "$@"; fi

IP="$(setting SITES_SERVER_IP)"
[[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail "SITES_SERVER_IP in .env isn't an IPv4 address"

resolved() { getent ahostsv4 "$1" | awk 'NR==1 { print $1 }'; }

# --- 1. DNS -------------------------------------------------------------------------------------
log "DNS: every host must resolve to $IP"
missing=""
for entry in "${SITES[@]}"; do
  IFS='|' read -r _ _ _ names <<<"$entry"
  for host in $names; do
    got="$(resolved "$host" || true)"
    if [ "$got" = "$IP" ]; then
      echo "ok       $host -> $got"
    else
      echo "MISSING  $host -> ${got:-no answer} (expected $IP)"
      missing="$missing $host"
    fi
    # Let's Encrypt prefers IPv6 when a host has an AAAA record, so a wrong one breaks the certificate.
    if [ -n "$(getent ahostsv6 "$host" 2>/dev/null | awk '$1 ~ /:/ { print $1; exit }')" ]; then
      echo "         note: $host has an AAAA record; make sure it points to this server too"
    fi
  done
done
[ -z "$missing" ] ||
  fail "these hosts don't resolve to $IP yet:$missing
Create their A records in the $ZONE zone (OVH's manager, Web Cloud > Domains > $ZONE > DNS zone), wait for them to answer and run this again. Nothing was changed."

# --- 2. Nginx sites -----------------------------------------------------------------------------
log "Nginx sites"
added=""
for entry in "${SITES[@]}"; do
  IFS='|' read -r name template app _ <<<"$entry"
  available="$AVAILABLE_DIR/$name.conf"
  enabled="$ENABLED_DIR/$name.conf"
  if [ -e "$available" ]; then
    echo "$name: already there (kept as it is)."
    [ "$DRY_RUN" -eq 1 ] || [ -e "$enabled" ] || ln -s "$available" "$enabled"
    continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "$name: would be written from $template."
    continue
  fi
  render "$template" "$app" "$name" >"$available"
  ln -sf "$available" "$enabled"
  added="$added $name"
  echo "$name: written."
done

if [ "$DRY_RUN" -eq 0 ]; then
  if ! nginx -t 2>/dev/null; then
    for name in $added; do rm -f "$ENABLED_DIR/$name.conf" "$AVAILABLE_DIR/$name.conf"; done
    nginx -t || true
    fail "Nginx rejected the new sites; the ones written now were removed and nothing was reloaded"
  fi
  systemctl reload nginx
  echo "nginx -t passed; Nginx reloaded."
fi

# --- 3. Certificates ----------------------------------------------------------------------------
log "Certificates"
for entry in "${SITES[@]}"; do
  IFS='|' read -r name _ _ names <<<"$entry"
  first="${names%% *}"
  if [ -d "$LE_DIR/live/$first" ]; then
    echo "$name: certificate already there."
    continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "$name: would get a certificate for: $names"
    continue
  fi
  args=()
  for host in $names; do args+=(-d "$host"); done
  certbot --nginx "${args[@]}" --non-interactive --redirect
  echo "$name: certificate obtained."
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Dry run: nothing was changed."
  exit 0
fi

nginx -t
log "Checks"
for entry in "${SITES[@]}"; do
  IFS='|' read -r name _ _ names <<<"$entry"
  for host in $names; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$host/" || true)"
    # 502 is expected until the release that brings Neoqlick is running; anything else but 2xx/3xx/404 is not.
    echo "https://$host/ -> HTTP $code"
  done
done
echo
echo "Done. Neoqlick's sites and certificates are in place. Next steps: deploy/README.md, \"Neoqlick cut-over\"."
