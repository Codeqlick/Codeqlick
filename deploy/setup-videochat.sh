#!/usr/bin/env bash
# One-time setup of videochat.codeqlick.com on the production server (deploy/README.md, "Video
# chat"). Run it as cqadmin from /srv/codeqlick once the video chat is merged to main:
#
#   cd /srv/codeqlick && git pull --ff-only && ./deploy/setup-videochat.sh
#
# It asks for sudo (firewall, Nginx, certbot). Safe to run again: every step checks first.
#   1. DNS: an A record videochat.codeqlick.com -> SITES_SERVER_IP, through OVH's API with the
#      keys already in .env (the client-domains keys, with rights on /domain/zone/*).
#   2. .env: TURN_SECRET (a new random one if missing), TURN_URLS, VIDEOCHAT_URL,
#      COMPOSE_PROFILES=videochat (turns coturn on) and the VAPID keys for notifications.
#   3. Firewall: 3478/tcp+udp and 49160-49400/udp, when ufw is active.
#   4. The Nginx site and its Let's Encrypt certificate (once the DNS answers).
#   5. A release (deploy.sh --no-pull), then checks that the page answers and coturn runs.
set -euo pipefail

cd "$(dirname "$0")/.."
ZONE=codeqlick.com
SUB=videochat
HOST="$SUB.$ZONE"
ENV_FILE=.env
SITE=/etc/nginx/sites-available/videochat.codeqlick.com.conf

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
[ -f deploy/nginx/videochat.codeqlick.com.conf ] ||
  fail "the video chat isn't in this checkout yet: merge it and git pull first"
IP="$(setting SITES_SERVER_IP)"
[ -n "$IP" ] || fail "SITES_SERVER_IP is missing in .env"

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
[ -n "$(setting TURN_SECRET)" ] || set_setting TURN_SECRET "$(openssl rand -hex 32)"
[ -n "$(setting TURN_URLS)" ] ||
  set_setting TURN_URLS "stun:$HOST:3478,turn:$HOST:3478?transport=udp,turn:$HOST:3478?transport=tcp"
[ -n "$(setting VIDEOCHAT_URL)" ] || set_setting VIDEOCHAT_URL "https://$HOST"
profiles="$(setting COMPOSE_PROFILES)"
case ",$profiles," in
  *,videochat,*) ;;
  *) set_setting COMPOSE_PROFILES "${profiles:+$profiles,}videochat" ;;
esac
echo "TURN_SECRET, TURN_URLS, VIDEOCHAT_URL and COMPOSE_PROFILES are set."

# Web Push keys for the "someone is waiting" notifications, made by the API image's web-push.
if [ -z "$(setting VAPID_PUBLIC_KEY)" ] || [ -z "$(setting VAPID_PRIVATE_KEY)" ]; then
  keys="$(docker compose -f docker-compose.prod.yml run --rm --no-deps -T api node --input-type=module \
    -e "import w from 'web-push'; const k = w.generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey)" |
    tail -n 1)" || keys=""
  if [ -n "$keys" ]; then
    set_setting VAPID_PUBLIC_KEY "${keys%% *}"
    set_setting VAPID_PRIVATE_KEY "${keys##* }"
    echo "VAPID keys for notifications are set."
  else
    echo "Couldn't make the VAPID keys (notifications stay off); see deploy/.env.example."
  fi
fi

# --- 3. Firewall --------------------------------------------------------------------------------
log "Firewall"
if sudo ufw status 2>/dev/null | grep -q '^Status: active'; then
  sudo ufw allow 3478/tcp >/dev/null
  sudo ufw allow 3478/udp >/dev/null
  sudo ufw allow 49160:49400/udp >/dev/null
  echo "ufw: 3478/tcp+udp and 49160-49400/udp are open."
else
  echo "ufw isn't active. If OVH's network firewall is on, open 3478/tcp+udp and 49160-49400/udp there."
fi

# --- 4. Nginx and TLS ---------------------------------------------------------------------------
log "Nginx site"
if [ ! -f "$SITE" ]; then
  sudo cp deploy/nginx/videochat.codeqlick.com.conf "$SITE"
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

# --- 5. Release ---------------------------------------------------------------------------------
log "Release (starts coturn and gives the API the new settings)"
./deploy/deploy.sh --no-pull

log "Checks"
curl -fsS -o /dev/null --max-time 10 "https://$HOST/es/videochat" && echo "https://$HOST answers."
docker compose -f docker-compose.prod.yml ps coturn --format '{{.Service}}: {{.Status}}'
echo
echo "Done. Open https://$HOST, sign in and try a call from two devices (one on mobile data)."
