#!/usr/bin/env bash
# Publishes the domains of the managed client sites through Nginx. The site builder writes each
# site to /srv/codeqlick/sites/<slug>/current with a `domains` file (one per line); this asks
# cq-site (see deploy/README.md) for every domain that isn't served yet and already points at
# this server, and retries HTTPS for one that was published over HTTP only. Sites published with
# publish-site.sh have no `domains` file and are left alone.
#
# A site the builder marked with a `remove` file (expired request previews) is unpublished
# (`cq-site remove` for each of its domains) and its folder deleted.
#
# In the deploy user's crontab:  * * * * * /srv/codeqlick/deploy/sites/sync-sites.sh
set -euo pipefail

ROOT=/srv/codeqlick/sites
LOG="$HOME/.codeqlick-sites.log"
shopt -s nullglob

ips=$(hostname -I | tr ' ' '\n' | grep . || true)
listed=$(sudo -n /usr/local/sbin/cq-site list)

for marker in "$ROOT"/*/remove; do
  dir=$(dirname "$marker")
  if [[ -f $dir/domains ]]; then
    while read -r domain; do
      [[ -n $domain ]] || continue
      if grep -qxF "$domain" <<<"$listed"; then
        echo "$(date -Is) remove $domain" >>"$LOG"
        sudo -n /usr/local/sbin/cq-site remove "$domain" >>"$LOG" 2>&1 || true
      fi
    done <"$dir/domains"
  fi
  rm -rf -- "$dir"
done
listed=$(sudo -n /usr/local/sbin/cq-site list)

for file in "$ROOT"/*/domains; do
  dir=$(dirname "$file")
  [[ -f $dir/current/index.html ]] || continue
  while read -r domain; do
    [[ -n $domain ]] || continue
    getent ahostsv4 "$domain" | awk '{print $1}' | grep -qxF -f <(echo "$ips") || continue
    if grep -qxF "$domain" <<<"$listed" &&
      curl -fsS -o /dev/null --max-time 10 "https://$domain/"; then
      continue
    fi
    echo "$(date -Is) $domain" >>"$LOG"
    sudo -n /usr/local/sbin/cq-site add "$domain" static "$dir/current" >>"$LOG" 2>&1 || true
  done <"$file"
done
