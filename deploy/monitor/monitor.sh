#!/bin/sh
# Health check for the production stack, run by cron every 5 minutes as the deploy user:
#
#   */5 * * * * /srv/codeqlick/deploy/monitor/monitor.sh
#
# Checks the public site and API (through Nginx and TLS), every service's Docker health (the
# `backup` service is unhealthy when there is no dump from the last two days), free disk space
# and how long the TLS certificates have left. When the result changes it emails ALERT_TO
# (default: LEADS_NOTIFY_TO) through the same SMTP account as the site, with curl, so it works
# even when the containers don't: one email when something has
# been broken for two runs in a row (10 minutes), one when it is back.
#
#   ./deploy/monitor/monitor.sh --test   send a test email and exit
set -u

cd "${CODEQLICK_DIR:-$(dirname "$0")/../..}"
STATE_DIR="${MONITOR_STATE_DIR:-$HOME/.codeqlick-monitor}"
LOG="$STATE_DIR/monitor.log"
mkdir -p "$STATE_DIR"

setting() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1; }
SITE_URL="$(setting SITE_URL)"
SITE_URL="${SITE_URL:-https://codeqlick.com}"
API_URL="$(setting MONITOR_API_URL)"
API_URL="${API_URL:-https://api.$(echo "$SITE_URL" | sed 's#^https\?://##')}"
ALERT_TO="$(setting ALERT_TO)"
ALERT_TO="${ALERT_TO:-$(setting LEADS_NOTIFY_TO)}"
ALERT_TO="${ALERT_TO:-hello@codeqlick.com}"
COMPOSE="docker compose -f docker-compose.prod.yml"
SERVICES="db api web backup umami"
DISK_LIMIT="${MONITOR_DISK_LIMIT:-90}"
CERT_DAYS=14

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }

# Sends a plain-text email: $1 subject, body on stdin.
send_mail() {
  host="$(setting SMTP_HOST)"
  port="$(setting SMTP_PORT)"
  secure="$(setting SMTP_SECURE)"
  user="$(setting SMTP_USER)"
  password="$(setting SMTP_PASSWORD)"
  from_header="$(setting MAIL_FROM)"
  from_header="${from_header:-Codeqlick <hello@codeqlick.com>}"
  from_address="$(echo "$from_header" | sed 's/.*<\(.*\)>.*/\1/')"
  if [ "$secure" = "true" ]; then url="smtps://$host:${port:-465}"; else url="smtp://$host:${port:-587}"; fi

  message="$(mktemp)"
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\n' \
      "$from_header" "$ALERT_TO" "$1" "$(date -R)"
    printf 'Content-Type: text/plain; charset=utf-8\r\n\r\n'
    cat
    printf '\r\n-- \r\nCodeqlick server monitor (%s)\r\n' "$(hostname)"
  } > "$message"
  # The password goes through a config file, not the command line (visible in `ps`).
  config="$(mktemp)"
  chmod 600 "$config"
  printf 'user = "%s:%s"\n' "$user" "$password" > "$config"
  curl -sS --max-time 30 --ssl-reqd --url "$url" --mail-from "$from_address" \
    --mail-rcpt "$ALERT_TO" --upload-file "$message" -K "$config"
  status=$?
  rm -f "$message" "$config"
  return $status
}

if [ "${1:-}" = "--test" ]; then
  echo "This is a test of the server monitor: alerts reach this address." |
    send_mail "[codeqlick] Monitor test" && echo "Test email sent to $ALERT_TO"
  exit $?
fi

problems=""
fail() { problems="${problems}- $*
"; }

check_url() {
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null)"
  [ "$code" = "200" ] || fail "$1 answered ${code:-nothing} (expected 200)"
}
check_url "$SITE_URL/en"
check_url "$API_URL/v1/health"

for service in $SERVICES; do
  health="$($COMPOSE ps --format '{{.Health}}' "$service" 2>/dev/null)"
  [ "$health" = "healthy" ] || fail "service $service is ${health:-not running}"
done

used="$(df -P / | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
[ "${used:-0}" -lt "$DISK_LIMIT" ] || fail "disk / is ${used}% full"

for url in "$SITE_URL" "$API_URL"; do
  host="$(echo "$url" | sed 's#^https\?://##; s#/.*##')"
  end="$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -z "$end" ]; then
    fail "could not read the TLS certificate of $host"
  else
    left=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
    [ "$left" -ge "$CERT_DAYS" ] || fail "the TLS certificate of $host expires in $left days"
  fi
done

# Email only when the result changes, and only once a problem shows up in two runs in a row: a
# deploy's restart or a network blip doesn't get an alert. `alerted` is what the last alert said.
problems="$(printf '%s' "$problems")" # $(...) drops trailing newlines, like the reads below
last_run="$(cat "$STATE_DIR/last_run" 2>/dev/null)"
alerted="$(cat "$STATE_DIR/alerted" 2>/dev/null)"
if [ -n "$problems" ]; then
  if [ "$problems" = "$last_run" ] && [ "$problems" != "$alerted" ]; then
    printf 'Something is wrong on the Codeqlick server:\n\n%s\n\nStatus: %s ps\nLogs:   %s logs --tail 100 <service>\n' \
      "$problems" "$COMPOSE" "$COMPOSE" |
      send_mail "[codeqlick] ALERT: $(printf '%s' "$problems" | head -n 1 | cut -c3-)" &&
      printf '%s' "$problems" > "$STATE_DIR/alerted"
    log "ALERT $(printf '%s' "$problems" | tr '\n' ' ')"
  fi
elif [ -n "$alerted" ]; then
  printf 'Everything is back to normal. It was:\n\n%s\n' "$alerted" |
    send_mail "[codeqlick] Resolved" && : > "$STATE_DIR/alerted"
  log "RESOLVED"
fi
printf '%s' "$problems" > "$STATE_DIR/last_run"
