#!/usr/bin/env bash
# Sends another domain of the brand to the website: <domain> and www.<domain> answer with a
# permanent redirect (301, path and query kept) to https://codeqlick.com, over HTTP and HTTPS.
# Run it from /srv/codeqlick as a user with sudo, once the domain is registered at OVH with the
# team's account (deploy/README.md, "Other domains of the brand"):
#
#   sudo ./deploy/setup-redirect.sh codeqlick.es
#
#   1. DNS: `@` and `www` A records to SITES_SERVER_IP through OVH's API (OVH's parking records
#      for them are replaced); MX, TXT and the rest are never touched.
#   2. An Nginx site /etc/nginx/sites-available/redirect-<domain>.conf, checked and reloaded.
#   3. A Let's Encrypt certificate for both names (certbot adds the HTTPS listener to that site).
# Safe to run again.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}
log() { printf '\n==> %s\n' "$*"; }

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"

DOMAIN="${1:-}"
TARGET="${2:-https://codeqlick.com}"
[[ ${#DOMAIN} -le 253 && "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] ||
  fail "usage: sudo ./deploy/setup-redirect.sh <domain> [target], e.g. codeqlick.es"
[[ "$TARGET" =~ ^https://[a-z0-9.-]+$ ]] || fail "the target must be https://<host>, without a path"
case "$DOMAIN" in
  codeqlick.com | *.codeqlick.com) fail "$DOMAIN is the website itself" ;;
esac

ENV_FILE="$(pwd)/.env"
SITE="/etc/nginx/sites-available/redirect-$DOMAIN.conf"
ENABLED="/etc/nginx/sites-enabled/redirect-$DOMAIN.conf"

setting() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
# The IPv4 a name resolves to, or nothing while it doesn't resolve yet (never fails the script).
resolve() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}' || true; }
[ -r "$ENV_FILE" ] || fail "$ENV_FILE not found"
IP="$(setting SITES_SERVER_IP)"
OVH_AK="$(setting OVH_APPLICATION_KEY)"
OVH_AS="$(setting OVH_APPLICATION_SECRET)"
OVH_CK="$(setting OVH_CONSUMER_KEY)"
[[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail "SITES_SERVER_IP in .env isn't an IPv4 address"
[ -n "$OVH_AK" ] && [ -n "$OVH_AS" ] && [ -n "$OVH_CK" ] || fail "OVH's keys aren't in .env"
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

# --- 1. DNS -------------------------------------------------------------------------------------
log "DNS: $DOMAIN and www.$DOMAIN -> $IP"
ovh GET "/domain/zone/$DOMAIN" >/dev/null ||
  fail "OVH has no DNS zone $DOMAIN for these keys (is it registered with the team's account yet?)"
changed=0
for sub in "" "www"; do
  name="${sub:+$sub.}$DOMAIN"
  ids="$(ovh GET "/domain/zone/$DOMAIN/record?fieldType=A&subDomain=$sub" | tr -d '[] ')"
  if [ -z "$ids" ]; then
    # A CNAME on www (OVH's default parking setup) would clash with the A record: drop it.
    for cname in $(ovh GET "/domain/zone/$DOMAIN/record?fieldType=CNAME&subDomain=$sub" | tr -d '[] ' | tr ',' ' '); do
      ovh DELETE "/domain/zone/$DOMAIN/record/$cname" >/dev/null
      echo "CNAME on $name removed."
    done
    ovh POST "/domain/zone/$DOMAIN/record" \
      "{\"fieldType\":\"A\",\"subDomain\":\"$sub\",\"target\":\"$IP\",\"ttl\":300}" >/dev/null
    changed=1
    echo "A $name -> $IP created."
  else
    for id in ${ids//,/ }; do
      target="$(ovh GET "/domain/zone/$DOMAIN/record/$id" | sed -n 's/.*"target":"\([^"]*\)".*/\1/p')"
      if [ "$target" != "$IP" ]; then
        # A new domain points at OVH's parking page: send it here instead.
        ovh PUT "/domain/zone/$DOMAIN/record/$id" "{\"target\":\"$IP\",\"ttl\":300}" >/dev/null
        changed=1
        echo "A $name: $target -> $IP."
      else
        echo "A $name already points to $IP."
      fi
    done
  fi
done
if [ "$changed" -eq 1 ]; then
  ovh POST "/domain/zone/$DOMAIN/refresh" >/dev/null
  echo "Zone refreshed; waiting for the names to resolve here…"
  for _ in $(seq 1 30); do
    a="$(resolve "$DOMAIN")"
    w="$(resolve "www.$DOMAIN")"
    [ "$a" = "$IP" ] && [ "$w" = "$IP" ] && break
    sleep 10
  done
fi

# --- 2. Nginx -----------------------------------------------------------------------------------
log "Nginx site: $SITE"
if [ ! -f "$SITE" ]; then
  cat >"$SITE" <<EOF
# Managed by deploy/setup-redirect.sh: $DOMAIN goes to $TARGET (301, path kept).
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 $TARGET\$request_uri;
}
EOF
  ln -sfn "$SITE" "$ENABLED"
  if ! nginx -t -q; then
    rm -f "$SITE" "$ENABLED"
    fail "Nginx rejected the site; nothing changed"
  fi
  systemctl reload nginx
  echo "Created."
else
  echo "Already there."
fi

# --- 3. Certificate -----------------------------------------------------------------------------
log "Certificate for $DOMAIN and www.$DOMAIN"
a="$(resolve "$DOMAIN")"
w="$(resolve "www.$DOMAIN")"
if [ "$a" != "$IP" ] || [ "$w" != "$IP" ]; then
  fail "$DOMAIN or www.$DOMAIN doesn't resolve to $IP yet: run this again in a few minutes"
fi
# No --redirect: the site already sends everything to $TARGET, so the HTTPS listener certbot adds
# to it answers with the same 301.
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
  --register-unsafely-without-email --keep-until-expiring --no-redirect >/dev/null
systemctl reload nginx
echo
echo "Done: https://$DOMAIN and https://www.$DOMAIN redirect to $TARGET."
