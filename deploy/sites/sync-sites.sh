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
# Codeqlick Cloud (architecture 8.3): each file in /srv/codeqlick/cloud/domains/ is a verified
# custom domain (the file's name) of a project (its slug inside). It is published with
# `cq-site add <domain> cloud <slug>` once it points here, and unpublished when its file is gone.
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

# ── Codeqlick Cloud's custom domains ────────────────────────────────────────────────────────────
CLOUD_DOMAINS=/srv/codeqlick/cloud/domains
if [[ -d $CLOUD_DOMAINS ]]; then
  listed=$(sudo -n /usr/local/sbin/cq-site list)
  # Domains cq-site serves for Cloud: their Nginx site's root is a Cloud host link.
  served=$(grep -l "root /srv/codeqlick/cloud/hosts/" /etc/nginx/sites-available/cq-site-*.conf 2>/dev/null |
    sed 's|.*/cq-site-||; s|\.conf$||' || true)
  for domain in $served; do
    [[ -f $CLOUD_DOMAINS/$domain ]] && continue
    echo "$(date -Is) cloud remove $domain" >>"$LOG"
    sudo -n /usr/local/sbin/cq-site remove "$domain" >>"$LOG" 2>&1 || true
  done
  for file in "$CLOUD_DOMAINS"/*; do
    domain=$(basename "$file")
    slug=$(head -n 1 "$file")
    [[ $slug =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || continue
    getent ahostsv4 "$domain" | awk '{print $1}' | grep -qxF -f <(echo "$ips") || continue
    conf=/etc/nginx/sites-available/cq-site-$domain.conf
    # A 404 over HTTPS still means it is served: only (re)publish when HTTPS doesn't answer at all.
    if grep -qxF "$domain" <<<"$listed" && grep -q "root /srv/codeqlick/cloud/hosts/$slug;" "$conf" 2>/dev/null &&
      curl -sS -o /dev/null --max-time 10 "https://$domain/" 2>/dev/null; then
      continue
    fi
    echo "$(date -Is) cloud $domain ($slug)" >>"$LOG"
    sudo -n /usr/local/sbin/cq-site add "$domain" cloud "$slug" >>"$LOG" 2>&1 || true
  done
fi
