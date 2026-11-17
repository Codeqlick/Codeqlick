#!/usr/bin/env bash
# One-time setup of coturn, the STUN/TURN relay Meetings' calls use (deploy/README.md, "Meetings and
# coturn"). Run it as cqadmin from /srv/codeqlick:
#
#   cd /srv/codeqlick && git pull --ff-only && ./deploy/setup-coturn.sh
#
# It asks for sudo (firewall). Safe to run again: every step checks first.
#   1. .env: TURN_SECRET (a new random one if missing), TURN_URLS (on meetings.codeqlick.com, which
#      points at this server) and COMPOSE_PROFILES=turn (turns coturn on).
#   2. Firewall: 3478/tcp+udp and 49160-49400/udp, when ufw is active.
#   3. A release (deploy.sh --no-pull), then checks that coturn runs.
set -euo pipefail

cd "$(dirname "$0")/.."
# Any host of this server works as the relay's name; Meetings' own is the one that stays.
HOST=meetings.codeqlick.com
ENV_FILE=.env

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

[ -f "$ENV_FILE" ] || fail "run it from /srv/codeqlick (there is no .env here)"

# --- 1. Settings --------------------------------------------------------------------------------
log "Settings in .env"
[ -n "$(setting TURN_SECRET)" ] || set_setting TURN_SECRET "$(openssl rand -hex 32)"
[ -n "$(setting TURN_URLS)" ] ||
  set_setting TURN_URLS "stun:$HOST:3478,turn:$HOST:3478?transport=udp,turn:$HOST:3478?transport=tcp"
profiles="$(setting COMPOSE_PROFILES)"
case ",$profiles," in
  *,turn,*) ;;
  *) set_setting COMPOSE_PROFILES "${profiles:+$profiles,}turn" ;;
esac
echo "TURN_SECRET, TURN_URLS and COMPOSE_PROFILES are set."

# --- 2. Firewall --------------------------------------------------------------------------------
log "Firewall"
if sudo ufw status 2>/dev/null | grep -q '^Status: active'; then
  sudo ufw allow 3478/tcp >/dev/null
  sudo ufw allow 3478/udp >/dev/null
  sudo ufw allow 49160:49400/udp >/dev/null
  echo "ufw: 3478/tcp+udp and 49160-49400/udp are open."
else
  echo "ufw isn't active. If OVH's network firewall is on, open 3478/tcp+udp and 49160-49400/udp there."
fi

# --- 3. Release ---------------------------------------------------------------------------------
log "Release (starts coturn and gives the API the new settings)"
./deploy/deploy.sh --no-pull

log "Checks"
docker compose -f docker-compose.prod.yml ps coturn --format '{{.Service}}: {{.Status}}'
echo
echo "Done. Open a meeting from two devices (one on mobile data) and check that the call connects."
