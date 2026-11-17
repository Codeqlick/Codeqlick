#!/usr/bin/env bash
# The Neoqlick cut-over, Nginx side (architecture 4.18, decision 130): turns the old
# cruising./swipe./videochat.codeqlick.com sites into permanent redirects (301) to the same path and
# query on <app>.neoqlick.com, answers 410 on their /ws, and serves the self-unregistering service
# worker script at /<app>-sw.js (a browser refuses a redirect for a worker script). The old sites
# keep their Let's Encrypt certificates, so the redirects work over HTTPS and certbot keeps renewing
# them. Run it ONCE, at cut-over, after deploy/setup-neoqlick.sh and the release of Neoqlick are
# done (deploy/README.md, "Neoqlick cut-over"):
#
#   sudo ./deploy/neoqlick-cutover.sh              # does it
#   ./deploy/neoqlick-cutover.sh --dry-run         # checks the preconditions, shows the diff; changes nothing
#   sudo ./deploy/neoqlick-cutover.sh --rollback   # puts the previous sites back (see below)
#   ./deploy/neoqlick-cutover.sh --render DIR      # only writes the rendered sites into DIR
#   --force                                        # skips the "new hosts answer" check
#
# Before replacing a site it keeps a copy next to it (<site>.conf.bak-neoqlick-<date>); --rollback
# puts the newest copy of each back. The account hosts are not touched: account.codeqlick.com stays
# Codeqlick's. Safe to run again: a site that is already a redirect is left alone, and when `nginx -t`
# fails the copies are put back and nothing is reloaded.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TEMPLATE="$ROOT/deploy/nginx/legacy-redirect.conf.template"
SW_SOURCE="$ROOT/deploy/nginx/legacy-sw-unregister.js"
SW_DIR="${LEGACY_SW_DIR:-/var/www/neoqlick-legacy}"
AVAILABLE_DIR="${NGINX_AVAILABLE_DIR:-/etc/nginx/sites-available}"
ENABLED_DIR="${NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
LE_DIR="${LETSENCRYPT_DIR:-/etc/letsencrypt}"
OLD_ZONE=codeqlick.com
NEW_ZONE=neoqlick.com
APPS="cruising swipe videochat"
MARKER="after the Neoqlick cut-over"
STAMP="$(date +%Y%m%d%H%M%S)"

DRY_RUN=0
ROLLBACK=0
FORCE=0
RENDER_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --rollback) ROLLBACK=1 ;;
    --force) FORCE=1 ;;
    --render)
      shift
      RENDER_DIR="${1:-}"
      [ -n "$RENDER_DIR" ] || {
        echo "Error: --render needs a directory" >&2
        exit 1
      }
      ;;
    -h | --help)
      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
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

render() {
  local app="$1"
  sed -e "s|@OLD@|$app.$OLD_ZONE|g" -e "s|@NEW@|$app.$NEW_ZONE|g" \
    -e "s|@APP@|$app|g" -e "s|@SW_DIR@|$SW_DIR|g" "$TEMPLATE"
}

if [ -n "$RENDER_DIR" ]; then
  mkdir -p "$RENDER_DIR"
  for app in $APPS; do
    render "$app" >"$RENDER_DIR/$app.$OLD_ZONE.conf"
    echo "Wrote $RENDER_DIR/$app.$OLD_ZONE.conf"
  done
  exit 0
fi

if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then exec sudo "$SELF" "$@"; fi

site_of() { printf '%s/%s.%s.conf' "$AVAILABLE_DIR" "$1" "$OLD_ZONE"; }
is_redirect() { [ -f "$1" ] && grep -q "$MARKER" "$1"; }
newest_backup() { { ls -1 "$1".bak-neoqlick-* 2>/dev/null || true; } | sort | tail -n 1; } # shellcheck disable=SC2012

# Puts the files of $changed back from their copies and checks Nginx; used when nginx -t fails.
restore_all() {
  local app site backup
  for app in $changed; do
    site="$(site_of "$app")"
    backup="$(newest_backup "$site")"
    [ -z "$backup" ] || cp -p "$backup" "$site"
  done
}

# --- Rollback -----------------------------------------------------------------------------------
if [ "$ROLLBACK" -eq 1 ]; then
  log "Rollback: the sites as they were before the cut-over"
  changed=""
  for app in $APPS; do
    site="$(site_of "$app")"
    backup="$(newest_backup "$site")"
    if [ -z "$backup" ]; then
      echo "$app.$OLD_ZONE: no copy to put back (never replaced, or already restored)."
      continue
    fi
    if ! is_redirect "$site"; then
      echo "$app.$OLD_ZONE: already isn't a redirect; left as it is."
      continue
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "$app.$OLD_ZONE: would restore $backup"
      continue
    fi
    cp -p "$site" "$site.redirect-$STAMP"
    cp -p "$backup" "$site"
    changed="$changed $app"
    echo "$app.$OLD_ZONE: restored from $backup (the redirect site is in $site.redirect-$STAMP)."
  done
  [ "$DRY_RUN" -eq 1 ] && exit 0
  if ! nginx -t 2>/dev/null; then
    for app in $changed; do cp -p "$(site_of "$app").redirect-$STAMP" "$(site_of "$app")"; done
    nginx -t || true
    fail "nginx -t failed: the redirect sites were put back and nothing was reloaded"
  fi
  systemctl reload nginx
  echo
  echo "Rolled back: the old hosts proxy to the website again. If a release with the in-app redirects"
  echo "(Codeqlick's proxy) is deployed, revert that deploy too, or the website will still redirect."
  exit 0
fi

# --- Preconditions ------------------------------------------------------------------------------
log "Checking that the new hosts are ready"
problems=""
for app in $APPS; do
  old="$app.$OLD_ZONE"
  new="$app.$NEW_ZONE"
  site="$(site_of "$app")"
  [ -d "$LE_DIR/live/$old" ] || problems="$problems
  - no certificate for $old in $LE_DIR/live (the redirect would have no HTTPS)"
  [ -d "$LE_DIR/live/$new" ] || problems="$problems
  - no certificate for $new: run deploy/setup-neoqlick.sh first"
  [ -f "$site" ] || problems="$problems
  - $site doesn't exist"
  if [ "$FORCE" -eq 0 ]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$new/" 2>/dev/null || true)"
    case "$code" in
      2* | 3*) echo "ok  https://$new/ -> HTTP $code" ;;
      *) problems="$problems
  - https://$new/ answers HTTP ${code:-000}: deploy the Neoqlick release first (or --force)" ;;
    esac
  fi
done
for f in "$LE_DIR/options-ssl-nginx.conf" "$LE_DIR/ssl-dhparams.pem" "$SW_SOURCE" "$TEMPLATE"; do
  [ -f "$f" ] || problems="$problems
  - missing $f"
done
[ -z "$problems" ] || fail "not ready; nothing was changed:$problems"

# --- Cut-over -----------------------------------------------------------------------------------
log "Redirect sites"
if [ "$DRY_RUN" -eq 0 ]; then
  install -d -o root -g root -m 0755 "$SW_DIR"
  install -o root -g root -m 0644 "$SW_SOURCE" "$SW_DIR/legacy-sw-unregister.js"
fi
changed=""
for app in $APPS; do
  site="$(site_of "$app")"
  if is_redirect "$site"; then
    echo "$app.$OLD_ZONE: already a redirect (left as it is)."
    continue
  fi
  tmp="$(mktemp)"
  render "$app" >"$tmp"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "$app.$OLD_ZONE: would change as follows"
    diff -u "$site" "$tmp" || true
    rm -f "$tmp"
    continue
  fi
  cp -p "$site" "$site.bak-neoqlick-$STAMP"
  cat "$tmp" >"$site"
  rm -f "$tmp"
  [ -e "$ENABLED_DIR/$app.$OLD_ZONE.conf" ] || ln -s "$site" "$ENABLED_DIR/$app.$OLD_ZONE.conf"
  changed="$changed $app"
  echo "$app.$OLD_ZONE: now redirects to $app.$NEW_ZONE (previous site: $site.bak-neoqlick-$STAMP)."
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Dry run: nothing was changed."
  exit 0
fi
[ -n "$changed" ] || {
  echo "Nothing to change."
  exit 0
}

if ! nginx -t 2>/dev/null; then
  restore_all
  nginx -t || true
  fail "nginx -t failed: the previous sites were put back and nothing was reloaded"
fi
systemctl reload nginx
echo "nginx -t passed; Nginx reloaded."

log "Checks"
for app in $APPS; do
  old="$app.$OLD_ZONE"
  new="$app.$NEW_ZONE"
  got="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "https://$old/es/example?a=1" || true)"
  echo "https://$old/es/example?a=1 -> $got (expected: 301 https://$new/es/example?a=1)"
  got="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$old/$app-sw.js" || true)"
  echo "https://$old/$app-sw.js -> $got (expected: 200)"
  got="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$old/ws" || true)"
  echo "https://$old/ws -> $got (expected: 410)"
done
echo
echo "Done. To undo: sudo ./deploy/neoqlick-cutover.sh --rollback"
echo "Check that renewal still works: sudo certbot renew --dry-run --cert-name <app>.$OLD_ZONE"
