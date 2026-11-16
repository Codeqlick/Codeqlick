#!/usr/bin/env bash
# Checks the email authentication records of a domain that sends through OVH's SMTP
# (architecture 4.5, decision 109): SPF, DKIM and DMARC. It only reads public DNS with `dig` and
# prints what is there, what is missing or weak, and the exact records to add in OVH's DNS zone.
# It never changes anything: the owner edits the zone in OVH's manager.
#
#   ./deploy/check-email-dns.sh [domain] [dkim-selector …]
#
# Defaults: codeqlick.com and OVH's two rotating selectors, ovhmo-selector-1 and ovhmo-selector-2.
# Exit status: 0 when everything is in place, 1 when something should be fixed, 2 on bad usage.
set -Euo pipefail

DOMAIN="${1:-codeqlick.com}"
shift || true
SELECTORS=("$@")
[ ${#SELECTORS[@]} -gt 0 ] || SELECTORS=(ovhmo-selector-1 ovhmo-selector-2)
# Where DMARC's daily aggregate reports go when the domain has none yet.
REPORTS="${DMARC_REPORTS_TO:-postmaster@$DOMAIN}"

command -v dig >/dev/null || {
  echo "Error: dig is needed (dnsutils / bind-utils)" >&2
  exit 2
}
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || {
  echo "usage: $0 [domain] [dkim-selector …]" >&2
  exit 2
}

problems=0
ok() { printf '  OK    %s\n' "$*"; }
warn() {
  printf '  WARN  %s\n' "$*"
  problems=$((problems + 1))
}
fix() { printf '        %s\n' "$@"; }

# TXT records of a name, one per line, quotes and the splits of long records removed.
txt() { dig +short TXT "$1" | sed -e 's/" "//g' -e 's/^"//' -e 's/"$//'; }

echo "Email authentication of $DOMAIN (read from public DNS on $(date -u +%Y-%m-%dT%H:%MZ))"

# --- SPF ---------------------------------------------------------------------------------------
echo
echo "SPF ($DOMAIN TXT)"
spf="$(txt "$DOMAIN" | grep -i '^v=spf1' || true)"
spf_count="$(printf '%s' "$spf" | grep -c . || true)"
RECOMMENDED_SPF="v=spf1 include:mx.ovh.com ~all"
if [ "$spf_count" -eq 0 ]; then
  warn "no SPF record: receivers can't tell OVH may send for $DOMAIN"
  fix "Add in OVH (Web Cloud > Domains > $DOMAIN > DNS zone > Add an entry > TXT):" \
    "  subdomain: (empty)   value: \"$RECOMMENDED_SPF\""
elif [ "$spf_count" -gt 1 ]; then
  warn "$spf_count SPF records: receivers treat that as a permanent error"
  printf '%s\n' "$spf" | sed 's/^/        found: /'
  fix "Keep one TXT record that merges them, e.g. \"$RECOMMENDED_SPF\""
else
  echo "  found: $spf"
  if grep -qi 'include:mx\.ovh\.com' <<<"$spf"; then
    ok "authorises OVH's mail servers (include:mx.ovh.com)"
  else
    warn "OVH's servers are not authorised: add include:mx.ovh.com before the 'all' mechanism"
    fix "e.g. \"$RECOMMENDED_SPF\""
  fi
  case "$(grep -oiE '[~?+-]?all$' <<<"$spf" | tr 'A-Z' 'a-z')" in
    -all | ~all) ok "ends with $(grep -oiE '[~-]all$' <<<"$spf")" ;;
    *) warn "doesn't end with ~all or -all: anyone may send as $DOMAIN" ;;
  esac
  others="$(grep -oiE 'include:[^ ]+' <<<"$spf" | grep -vi 'include:mx\.ovh\.com' || true)"
  if [ -n "$others" ]; then
    echo "  NOTE  also authorises: $(tr '\n' ' ' <<<"$others")- remove any service that no longer sends for $DOMAIN"
  fi
  # RFC 7208: at most 10 DNS lookups (include, a, mx, ptr, exists, redirect), counted recursively.
  lookups() {
    local record="$1" depth="$2" total=0 term target
    [ "$depth" -gt 5 ] && {
      echo 99
      return
    }
    for term in $record; do
      case "$(tr 'A-Z' 'a-z' <<<"$term")" in
        include:* | redirect=*)
          target="${term#*[:=]}"
          total=$((total + 1 + $(lookups "$(txt "$target" | grep -i '^v=spf1' | head -n 1)" $((depth + 1)))))
          ;;
        a | a:* | a/* | mx | mx:* | mx/* | ptr | ptr:* | exists:*) total=$((total + 1)) ;;
      esac
    done
    echo "$total"
  }
  count="$(lookups "$spf" 0)"
  if [ "$count" -le 10 ]; then ok "$count of the 10 DNS lookups SPF allows"; else
    warn "$count DNS lookups: over SPF's limit of 10, receivers will fail it"
  fi
fi

# --- DKIM --------------------------------------------------------------------------------------
echo
echo "DKIM (${SELECTORS[*]})"
dkim_found=0
for selector in "${SELECTORS[@]}"; do
  name="$selector._domainkey.$DOMAIN"
  cname="$(dig +short CNAME "$name" | head -n 1)"
  key="$(txt "$name" | grep -i 'v=DKIM1' | head -n 1)"
  if [ -n "$key" ] && grep -qE 'p=[A-Za-z0-9+/]{100,}' <<<"$key"; then
    dkim_found=$((dkim_found + 1))
    ok "$name has a public key${cname:+ (CNAME to $cname)}"
  elif [ -n "$key" ]; then
    warn "$name has an empty or revoked key (p=)"
  else
    echo "  --    $name: none${cname:+ (CNAME to $cname, which has no key)}"
  fi
done
if [ "$dkim_found" -eq 0 ]; then
  warn "no DKIM key: OVH's emails for $DOMAIN aren't signed, so DMARC can only pass on SPF"
  fix "In OVH's manager: Web Cloud > Emails > $DOMAIN > DKIM (or Domains > $DOMAIN > DKIM):" \
    "enable DKIM. With the zone at OVH it adds the two CNAME records itself:" \
    "  ovhmo-selector-1._domainkey  CNAME  ovhmo-selector-1._domainkey.<id>.<zone>.dkim.mail.ovh.net." \
    "  ovhmo-selector-2._domainkey  CNAME  ovhmo-selector-2._domainkey.<id>.<zone>.dkim.mail.ovh.net." \
    "(OVH shows the exact targets; then run this script again.)"
fi

# --- DMARC -------------------------------------------------------------------------------------
echo
echo "DMARC (_dmarc.$DOMAIN TXT)"
dmarc="$(txt "_dmarc.$DOMAIN" | grep -i '^v=DMARC1' || true)"
RECOMMENDED_DMARC="v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100; rua=mailto:$REPORTS"
if [ -z "$dmarc" ]; then
  warn "no DMARC record: receivers have no policy for mail that fails SPF and DKIM"
  fix "Add in OVH (DNS zone > Add an entry > TXT):" \
    "  subdomain: _dmarc   value: \"$RECOMMENDED_DMARC\""
elif [ "$(printf '%s\n' "$dmarc" | grep -c .)" -gt 1 ]; then
  warn "more than one DMARC record: receivers ignore them all; keep one"
else
  echo "  found: $dmarc"
  policy="$(grep -oiE '(^|;)[[:space:]]*p=[a-z]+' <<<"$dmarc" | sed 's/.*=//' | tr 'A-Z' 'a-z')"
  case "$policy" in
    reject) ok "p=reject" ;;
    quarantine) ok "p=quarantine" ;;
    none)
      warn "p=none only monitors: mail that fails is still delivered as from $DOMAIN"
      fix "Once the aggregate reports show OVH's mail passing (SPF or DKIM aligned), replace the" \
        "TXT record of _dmarc in OVH's zone with the same one at p=quarantine:" \
        "  \"$(sed -E 's/(^|;)([[:space:]]*)p=none/\1\2p=quarantine/I' <<<"$dmarc")\""
      ;;
    *) warn "no valid p= tag" ;;
  esac
  if grep -qi 'rua=' <<<"$dmarc"; then
    ok "aggregate reports go to $(grep -oiE 'rua=[^;]+' <<<"$dmarc" | sed 's/rua=//')"
    for address in $(grep -oiE 'rua=[^;]+' <<<"$dmarc" | sed 's/rua=//' | tr ',' ' '); do
      host="${address#*@}"
      host="${host%%!*}"
      if [ "$host" != "$DOMAIN" ] && [ -z "$(txt "$DOMAIN._report._dmarc.$host" | grep -i 'v=DMARC1' || true)" ]; then
        warn "reports to $address: $host doesn't publish $DOMAIN._report._dmarc.$host, so receivers may not send them"
      fi
    done
  else
    warn "no rua=: nobody receives the aggregate reports"
    fix "add rua=mailto:$REPORTS"
  fi
fi

# --- MX (for the record) -----------------------------------------------------------------------
echo
echo "MX"
dig +short MX "$DOMAIN" | sort -n | sed 's/^/  /'

echo
if [ "$problems" -eq 0 ]; then
  echo "Everything in place."
else
  echo "$problems thing(s) to look at (see WARN above). Nothing was changed."
fi
[ "$problems" -eq 0 ]
