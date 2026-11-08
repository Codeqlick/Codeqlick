#!/usr/bin/env bash
# One-time setup of meetings.codeqlick.com on the production server (deploy/README.md,
# "Meetings"). Run it as cqadmin from /srv/codeqlick once Meetings is merged to main:
#
#   cd /srv/codeqlick && git pull --ff-only && ./deploy/setup-meetings.sh
#
# It asks for sudo (Nginx, certbot). Safe to run again: every step checks first.
#   1. DNS: an A record meetings.codeqlick.com -> SITES_SERVER_IP, through OVH's API with the
#      keys already in .env (the client-domains keys, with rights on /domain/zone/*).
#   2. .env: MEETINGS_URL. Calls use the video chat's coturn (TURN_SECRET, TURN_URLS), so the
#      video chat is set up first (deploy/setup-videochat.sh).
#   3. The Nginx site and its Let's Encrypt certificate (once the DNS answers).
#   4. A release (deploy.sh --no-pull), then checks that the page answers.
set -euo pipefail

cd "$(dirname "$0")/.."
ZONE=codeqlick.com
SUB=meetings
HOST="$SUB.$ZONE"
ENV_FILE=.env
SITE=/etc/nginx/sites-available/meetings.codeqlick.com.conf

log() { printf '\n==> %s\n' "$*"; }
fail() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}
setting() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1; }
set_setting() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}
resolved() { getent ahostsv4 "$HOST" | awk 'NR==1 { print $1 }'; }

[ -f "$ENV_FILE" ] || fail "run it from /srv/codeqlick (there is no .env here)"
[ -f deploy/nginx/meetings.codeqlick.com.conf ] ||
  fail "Meetings isn't in this checkout yet: merge it and git pull first"
IP="$(setting SITES_SERVER_IP)"
[ -n "$IP" ] || fail "SITES_SERVER_IP is missing in .env"
[ -n "$(setting TURN_SECRET)" ] ||
  echo "Warning: no TURN_SECRET in .env (run deploy/setup-videochat.sh first): calls behind strict networks will fail."

# --- 1. DNS -------------------------------------------------------------------------------------
OVH_AK="$(setting OVH_APPLICATION_KEY)"
OVH_AS="$(setting OVH_APPLICATION_SECRET)"
OVH_CK="$(setting OVH_CONSUMER_KEY)"
OVH_API=https://eu.api.ovh.com/1.0

# A signed OVH request: "$1$" + SHA-1 of "secret+consumer+METHOD+URL+body+timestamp".
ovh() {
  local method="$1" path="$2" body="${3:-}"
  local url="$OVH_API$path" ts sig
  ts="$(curl -fsS "$OVH_API/auth/time")"
  sig="\$1\$$(printf '%s' "$OVH_AS+$OVH_CK+$method+$url+$body+$ts" | sha1sum | cut -d' ' -f1)"
  local args=(-fsS -X "$method" "$url"
    -H "X-Ovh-Application: $OVH_AK" -H "X-Ovh-Consumer: $OVH_CK"
    -H "X-Ovh-Timestamp: $ts" -H "X-Ovh-Signature: $sig" -H 'Content-Type: application/json')
  if [ -n "$body" ]; then args+=(--data "$body"); fi
  curl "${args[@]}"
}

log "DNS: $HOST -> $IP"
if [ "$(resolved)" = "$IP" ]; then
  echo "Already there."
elif [ -n "$OVH_AK" ] && [ -n "$OVH_AS" ] && [ -n "$OVH_CK" ]; then
  ids="$(ovh GET "/domain/zone/$ZONE/record?fieldType=A&subDomain=$SUB")"
  if [ "$ids" = "[]" ]; then
    ovh POST "/domain/zone/$ZONE/record" \
      "{\"fieldType\":\"A\",\"subDomain\":\"$SUB\",\"target\":\"$IP\",\"ttl\":300}" >/dev/null
  else
    id="$(printf '%s' "$ids" | tr -d '[] ' | cut -d, -f1)"
    ovh PUT "/domain/zone/$ZONE/record/$id" "{\"target\":\"$IP\",\"ttl\":300}" >/dev/null
  fi
  ovh POST "/domain/zone/$ZONE/refresh" >/dev/null
  echo "Record saved in OVH's zone for $ZONE."
else
  fail "no OVH keys in .env: add the A record $HOST -> $IP in OVH's manager and run this again"
fi


# --- 2. Settings --------------------------------------------------------------------------------
log "Settings in .env"
[ -n "$(setting MEETINGS_URL)" ] || set_setting MEETINGS_URL "https://$HOST"
echo "MEETINGS_URL is set."

# --- 3. Nginx and TLS ---------------------------------------------------------------------------
log "Nginx site"
if [ ! -f "$SITE" ]; then
  sudo cp deploy/nginx/meetings.codeqlick.com.conf "$SITE"
  sudo ln -sf "$SITE" /etc/nginx/sites-enabled/
fi
sudo nginx -t
sudo systemctl reload nginx

log "Waiting for the DNS to answer (up to 10 minutes)"
for _ in $(seq 1 60); do
  [ "$(resolved)" = "$IP" ] && break
  sleep 10
done
[ "$(resolved)" = "$IP" ] ||
  fail "$HOST doesn't point to $IP yet: run this again in a few minutes (every step is safe to repeat)"

log "Certificate"
if sudo test -d "/etc/letsencrypt/live/$HOST"; then
  echo "Already there."
else
  sudo certbot --nginx -d "$HOST" --non-interactive --redirect
fi

# --- 4. Release ---------------------------------------------------------------------------------
log "Release (gives the API the new allowed origin)"
./deploy/deploy.sh --no-pull

log "Checks"
curl -fsS -o /dev/null --max-time 10 "https://$HOST/es/meetings" && echo "https://$HOST answers."
echo
echo "Done. Open https://$HOST, sign in, create a room and open its link on another device."
