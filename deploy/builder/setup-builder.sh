#!/usr/bin/env bash
# One-time setup of Codeqlick Cloud's build server (architecture 8.4): run as root ON THE BUILD
# SERVER, never on the production VPS (decision 41).
#
#   git clone git@github.com:Codeqlick/Codeqlick.git /opt/codeqlick-builder   (a read-only deploy key)
#   sudo bash /opt/codeqlick-builder/deploy/builder/setup-builder.sh
#
# Installs Docker, Git and Node 24, the user `builder` (in the docker group), the agent from the
# repository in /opt/codeqlick-builder, its service and a daily pull of the build images. Then put
# the token in /etc/codeqlick-builder.env and: systemctl restart codeqlick-builder
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR
[ "$(id -u)" -eq 0 ] || { echo "Run it as root (sudo)." >&2; exit 1; }

REPO="${CODEQLICK_REPO:-https://github.com/Codeqlick/Codeqlick.git}"
DIR=/opt/codeqlick-builder
log() { printf '\n==> %s\n' "$*"; }

log "Packages: Docker, Git, Node 24"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg tar >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

log "User and folders"
id builder >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin builder
usermod -aG docker builder
install -d -o builder -g builder -m 0700 /var/lib/codeqlick-builder

log "Agent: $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only
else
  # The repository is private: give a read-only deploy key or a token in CODEQLICK_REPO.
  git clone -q --depth 1 "$REPO" "$DIR"
fi
chown -R root:root "$DIR"
install -m 0755 "$DIR/deploy/builder/update.sh" "$DIR/update.sh"

if [ ! -f /etc/codeqlick-builder.env ]; then
  umask 077
  cat >/etc/codeqlick-builder.env <<ENV
CLOUD_API_URL=https://api.codeqlick.com/v1
CLOUD_BUILDER_TOKEN=
BUILDER_WORK_DIR=/var/lib/codeqlick-builder
ENV
  chmod 600 /etc/codeqlick-builder.env
fi

log "Service"
install -m 0644 "$DIR/deploy/builder/codeqlick-builder.service" /etc/systemd/system/codeqlick-builder.service
cat >/etc/cron.daily/codeqlick-builder-images <<'CRON'
#!/bin/sh
# Keeps the build images current (architecture 8.4).
for v in 20 22 24; do docker pull -q "node:$v-bookworm-slim" >/dev/null 2>&1; done
docker image prune -f >/dev/null 2>&1
CRON
chmod 0755 /etc/cron.daily/codeqlick-builder-images
/etc/cron.daily/codeqlick-builder-images || true
systemctl daemon-reload
systemctl enable codeqlick-builder >/dev/null

if grep -q '^CLOUD_BUILDER_TOKEN=$' /etc/codeqlick-builder.env; then
  echo
  echo "Almost done: put CLOUD_BUILDER_TOKEN (the same as in the production .env) in"
  echo "/etc/codeqlick-builder.env, then: systemctl restart codeqlick-builder"
else
  systemctl restart codeqlick-builder
  echo "The agent is running: journalctl -u codeqlick-builder -f"
fi
