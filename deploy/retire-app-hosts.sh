#!/usr/bin/env bash
# Retires the old app hosts cruising.codeqlick.com, swipe.codeqlick.com and
# videochat.codeqlick.com (architecture 4.7, decision 139): the 18+ apps left for their own
# project, so these names answer 410 Gone, with no redirect, until their DNS records are gone.
# Run it from /srv/codeqlick with sudo, after the release that removed the apps:
#
#   sudo ./deploy/retire-app-hosts.sh            dry run (the default): says what it would do
#   sudo ./deploy/retire-app-hosts.sh --apply    does it
#
#   1. Nginx: each host's site is replaced by one that answers 410 over HTTP and HTTPS. The
#      Let's Encrypt certificates stay where they are, so HTTPS keeps answering until they expire;
#      nothing renews them. The replaced site is kept next to it as <site>.retired-<date>.
#      `nginx -t` must pass, or the old sites are put back and nothing is reloaded.
#   2. .env: a TURN_URLS that still names a retired host (coturn's name while the video chat
#      existed) is moved to meetings.codeqlick.com, which stays, or Meetings' calls would lose
#      their relay when the DNS record goes. The API is restarted to read it.
#   3. DNS: the hosts' A records are deleted through OVH's API, with the keys the API container
#      already has (the client-domains keys), and the zone is refreshed.
#
# Safe to run again: a host that is already retired, or has no record, is skipped. It never deletes
# data: the volumes of the apps (swipe-data, cruising-data) are the owner's to remove afterwards
# (deploy/README.md, "Retiring the 18+ app hosts").
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

cd "$(dirname "$0")/.."
ZONE=codeqlick.com
HOSTS=(cruising swipe videochat)
SITES=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled
COMPOSE=(docker compose -f docker-compose.prod.yml)
STAMP="$(date +%Y%m%d%H%M%S)"
APPLY=false

case "${1:-}" in
  '') ;;
  --apply) APPLY=true ;;
  *)
    printf 'Usage: sudo %s [--apply]\n' "$0" >&2
    exit 2
    ;;
esac

log() { printf '\n==> %s\n' "$*"; }
fail() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run it with sudo"
[ -f .env ] || fail "run it from /srv/codeqlick (there is no .env here)"
OWNER="$(stat -c %U .)"
$APPLY || printf 'Dry run: nothing is changed. Run it again with --apply to retire the hosts.\n'

# --- 1. Nginx -----------------------------------------------------------------------------------
site_410() {
  local host="$1" cert="/etc/letsencrypt/live/$1"
  cat <<CONF
# $host: retired (architecture 4.7, decision 139). The 18+ apps left for their own project, so
# this name answers 410 Gone, without a redirect, until its DNS record is removed. Written by
# deploy/retire-app-hosts.sh.

server {
    listen 80;
    listen [::]:80;
    server_name $host;
    return 410;
}
CONF
  if [ -f "$cert/fullchain.pem" ] && [ -f "$cert/privkey.pem" ]; then
    cat <<CONF

# The certificate stays until it expires (it is not renewed), so HTTPS answers too.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $host;

    ssl_certificate $cert/fullchain.pem;
    ssl_certificate_key $cert/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 410;
}
CONF
  fi
}

log "Nginx: 410 Gone on the retired hosts"
changed=()
for app in "${HOSTS[@]}"; do
  host="$app.$ZONE"
  conf="$SITES/$host.conf"
  if [ -f "$conf" ] && grep -q 'deploy/retire-app-hosts.sh' "$conf"; then
    echo "$host: already retired."
    continue
  fi
  if $APPLY; then
    if [ -f "$conf" ]; then cp -p "$conf" "$conf.retired-$STAMP"; fi
    site_410 "$host" >"$conf"
    ln -sf "$conf" "$ENABLED/$host.conf"
    changed+=("$host")
    echo "$host: now answers 410."
  elif [ -f "/etc/letsencrypt/live/$host/fullchain.pem" ]; then
    echo "(dry run) would: replace $conf with a site that answers 410 (HTTPS kept with its certificate)"
  else
    echo "(dry run) would: replace $conf with a site that answers 410 (HTTP only: no certificate)"
  fi
done
if $APPLY && [ "${#changed[@]}" -gt 0 ]; then
  if nginx -t; then
    systemctl reload nginx
  else
    # Put each old site back, or take the new one away when there was none before.
    for host in "${changed[@]}"; do
      if [ -f "$SITES/$host.conf.retired-$STAMP" ]; then
        mv -f "$SITES/$host.conf.retired-$STAMP" "$SITES/$host.conf"
      else
        unlink "$ENABLED/$host.conf"
        unlink "$SITES/$host.conf"
      fi
    done
    fail "nginx -t failed: the old sites were put back and nothing was reloaded"
  fi
fi

# --- 2. TURN_URLS -------------------------------------------------------------------------------
log "coturn's name in .env"
turn="$(sed -n 's/^TURN_URLS=//p' .env | tail -n 1)"
if printf '%s' "$turn" | grep -Eq '(cruising|swipe|videochat)\.codeqlick\.com'; then
  if $APPLY; then
    moved="$(printf '%s' "$turn" | sed -E 's/(cruising|swipe|videochat)\.codeqlick\.com/meetings.codeqlick.com/g')"
    sed -i "s|^TURN_URLS=.*|TURN_URLS=$moved|" .env
    sudo -H -u "$OWNER" "${COMPOSE[@]}" up -d api
    echo "TURN_URLS now names meetings.codeqlick.com."
  else
    echo "(dry run) would: move TURN_URLS from a retired host to meetings.codeqlick.com"
  fi
else
  echo "TURN_URLS names none of the retired hosts."
fi

# --- 3. DNS -------------------------------------------------------------------------------------
log "DNS: the A records of the retired hosts"
# Runs inside the API container, which has the OVH keys (OVH_APPLICATION_KEY, OVH_APPLICATION_SECRET
# and OVH_CONSUMER_KEY) and Node, so nothing else has to be installed. Signed requests as in
# codeqlick-backend/src/modules/domains/ovh.client.ts: "$1$" + SHA-1 of
# "secret+consumer+METHOD+URL+body+timestamp".
dns_script='
import { createHash } from "node:crypto";
const API = "https://eu.api.ovh.com/1.0";
const { OVH_APPLICATION_KEY: key, OVH_APPLICATION_SECRET: secret, OVH_CONSUMER_KEY: consumer } =
  process.env;
if (!key || !secret || !consumer) {
  console.log("NOKEYS");
  process.exit(0);
}
const apply = process.argv[1] === "apply";
const zone = process.argv[2];
const delta = Number(await (await fetch(`${API}/auth/time`)).text()) - Math.floor(Date.now() / 1000);
async function call(method, path) {
  const url = API + path;
  const ts = Math.floor(Date.now() / 1000) + delta;
  const sha = createHash("sha1").update(`${secret}+${consumer}+${method}+${url}++${ts}`).digest("hex");
  const response = await fetch(url, {
    method,
    headers: {
      "X-Ovh-Application": key,
      "X-Ovh-Consumer": consumer,
      "X-Ovh-Timestamp": String(ts),
      "X-Ovh-Signature": `$1$${sha}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
let removed = 0;
for (const sub of process.argv.slice(3)) {
  const ids = await call("GET", `/domain/zone/${zone}/record?fieldType=A&subDomain=${sub}`);
  if (ids.length === 0) console.log(`${sub}.${zone}: no A record`);
  for (const id of ids) {
    const record = await call("GET", `/domain/zone/${zone}/record/${id}`);
    if (!apply) {
      console.log(`(dry run) would: delete the A record ${record.subDomain}.${zone} -> ${record.target}`);
      continue;
    }
    await call("DELETE", `/domain/zone/${zone}/record/${id}`);
    removed += 1;
    console.log(`${record.subDomain}.${zone} -> ${record.target}: deleted`);
  }
}
if (apply && removed > 0) {
  await call("POST", `/domain/zone/${zone}/refresh`);
  console.log("Zone refreshed.");
}
'
mode=dry
$APPLY && mode=apply
result="$(sudo -H -u "$OWNER" "${COMPOSE[@]}" exec -T api node --input-type=module -e "$dns_script" "$mode" "$ZONE" "${HOSTS[@]}")" ||
  fail "OVH's API refused (the keys need rights on DELETE /domain/zone/*): delete the A records by hand in OVH's manager"
if [ "$result" = NOKEYS ]; then
  fail "the API container has no OVH keys: delete the A records of ${HOSTS[*]} in OVH's manager (Web Cloud > Domains > $ZONE > DNS zone)"
fi
printf '%s\n' "$result"

log "Done"
if $APPLY; then
  cat <<'TXT'
The three hosts answer 410 until their DNS records expire. The certificates are not renewed.
Left for the owner (nothing here deletes data): once the release is in, remove the unused volumes
swipe-data and cruising-data of the compose project (check their names with `docker volume ls`).
TXT
else
  echo "Dry run finished: nothing was changed."
fi
