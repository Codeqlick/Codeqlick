#!/usr/bin/env bash
# Builds a static client site (e.g. a copy of the web-basica template) on this machine and
# publishes it on the server: uploads it as a new release, switches to it and, the first time,
# asks cq-site (installed by root, see deploy/README.md) for the Nginx site and its certificate.
#
#   deploy/sites/publish-site.sh <name> <domain> <repo-dir> [content-dir]
#
#   name         folder on the server (/srv/codeqlick/sites/<name>), e.g. peluqueria-marta
#   domain       peluqueriamarta.es or a preview like marta.demo.codeqlick.com
#   repo-dir     the site's repository on this machine
#   content-dir  SITE_DIR for the template (default: site), e.g. examples/peluqueria
#
# SERVER (default cqadmin@54.37.159.171) overrides the target. Keeps the last 5 releases.
set -euo pipefail

name=${1:-}
domain=${2:-}
repo=${3:-}
content=${4:-site}
server=${SERVER:-cqadmin@54.37.159.171}
root=/srv/codeqlick/sites

[[ $name =~ ^[a-z0-9-]+$ ]] || { echo "usage: $0 <name> <domain> <repo-dir> [content-dir]" >&2; exit 1; }
[[ $domain =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "invalid domain: '$domain'" >&2; exit 1; }
[[ -f $repo/package.json ]] || { echo "no package.json in '$repo'" >&2; exit 1; }

echo "==> Building $repo ($content) for https://$domain"
(
  cd "$repo"
  npm ci --no-audit --no-fund --loglevel=error
  SITE_DIR=$content SITE_URL=https://$domain npm run build --silent
)
[[ -f $repo/dist/index.html ]] || { echo "the build produced no dist/index.html" >&2; exit 1; }

release=$(date -u +%Y%m%d%H%M%S)
echo "==> Uploading release $release"
ssh "$server" "mkdir -p $root/$name/releases/$release && chmod 755 $root $root/$name $root/$name/releases"
rsync -a --delete "$repo/dist/" "$server:$root/$name/releases/$release/"

echo "==> Switching to it"
ssh "$server" bash -s -- "$root/$name" "$release" <<'REMOTE'
set -euo pipefail
cd "$1"
# Nginx (www-data) reads the files.
chmod -R u=rwX,go=rX "releases/$2"
ln -sfn "releases/$2" current.new && mv -T current.new current
ls -1d releases/* | sort | head -n -5 | xargs -r rm -rf
REMOTE

if ! ssh "$server" "sudo -n /usr/local/sbin/cq-site list" | grep -qx "$domain"; then
  echo "==> Publishing $domain on Nginx"
  ssh "$server" "sudo -n /usr/local/sbin/cq-site add $domain static $root/$name/current"
fi

status=$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/" || true)
echo "==> https://$domain/ answers $status"
[[ $status == 200 ]]
