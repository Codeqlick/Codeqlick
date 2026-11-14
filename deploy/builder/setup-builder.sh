#!/usr/bin/env bash
# One-time setup of Codeqlick Cloud's build agent (architecture 8.4, decision 41). Run as root on
# the build host: for now the production VPS itself, where every build runs under gVisor and a
# firewall keeps it on the internet only.
#
#   On the production VPS:  sudo bash /srv/codeqlick/deploy/builder/setup-builder.sh
#   On a dedicated server:  git clone git@github.com:Codeqlick/Codeqlick.git /opt/codeqlick-builder
#                           sudo bash /opt/codeqlick-builder/deploy/builder/setup-builder.sh
#
# Installs Git, Node 24 and gVisor (and Docker when missing), registers the `runsc` runtime with a
# Docker reload (running containers keep running), the user `builder` (in the docker group), the
# agent in /opt/codeqlick-builder, the firewall, its service and a daily pull of the build images,
# then checks that a sandboxed container reaches npm but not the host before starting the agent.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR
[ "$(id -u)" -eq 0 ] || { echo "Run it as root (sudo)." >&2; exit 1; }

PROD=/srv/codeqlick
if [ -d "$PROD/.git" ]; then
  REPO="${CODEQLICK_REPO:-$PROD}"
else
  REPO="${CODEQLICK_REPO:-https://github.com/Codeqlick/Codeqlick.git}"
fi
DIR=/opt/codeqlick-builder
ENV_FILE=/etc/codeqlick-builder.env
log() { printf '\n==> %s\n' "$*"; }

log "Packages: Git, Node 24, gVisor"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg tar >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v runsc >/dev/null; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    >/etc/apt/sources.list.d/gvisor.list
  apt-get update -qq
  apt-get install -y -qq runsc >/dev/null
fi

log "Docker runtime: runsc (a reload, never a restart)"
if ! docker info --format '{{json .Runtimes}}' | grep -q '"runsc"'; then
  runsc install
  systemctl reload docker
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    docker info --format '{{json .Runtimes}}' | grep -q '"runsc"' && break
    sleep 1
  done
  docker info --format '{{json .Runtimes}}' | grep -q '"runsc"' || {
    echo "Docker didn't pick up the runsc runtime" >&2
    exit 1
  }
fi

log "User and folders"
id builder >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin builder
usermod -aG docker builder
install -d -o builder -g builder -m 0700 /var/lib/codeqlick-builder
# The dependency caches (architecture 4.13, decision 51): the agent's user must own them, since it
# is also the user inside the build containers.
install -d -o builder -g builder -m 0700 /var/lib/codeqlick-builder/cache

log "Agent: $DIR (from $REPO)"
if [ -d "$REPO/.git" ]; then
  # A local repository owned by another user (the production checkout).
  git config --global --get-all safe.directory | grep -qx "$REPO" ||
    git config --global --add safe.directory "$REPO"
fi
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only
else
  # --no-local: copies the objects instead of hard-linking them, so the chown below never touches
  # the production checkout. A private GitHub repository needs a read-only deploy key instead.
  git clone -q --no-local --depth 1 "$REPO" "$DIR"
fi
chown -R root:root "$DIR"
install -m 0755 "$DIR/deploy/builder/update.sh" "$DIR/update.sh"

log "Settings: $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat >"$ENV_FILE" <<ENV
CLOUD_API_URL=https://api.codeqlick.com/v1
CLOUD_BUILDER_TOKEN=
BUILDER_WORK_DIR=/var/lib/codeqlick-builder
BUILDER_RUNTIME=runsc
ENV
  chmod 600 "$ENV_FILE"
fi
grep -q '^BUILDER_RUNTIME=' "$ENV_FILE" || echo 'BUILDER_RUNTIME=runsc' >>"$ENV_FILE"
# The dependency cache's limits, commented out with their defaults (added once, never overwritten).
grep -q 'BUILDER_CACHE_PROJECT_MB' "$ENV_FILE" || echo '#BUILDER_CACHE_PROJECT_MB=1024' >>"$ENV_FILE"
grep -q 'BUILDER_CACHE_TOTAL_MB' "$ENV_FILE" || echo '#BUILDER_CACHE_TOTAL_MB=10240' >>"$ENV_FILE"
if grep -q '^CLOUD_BUILDER_TOKEN=$' "$ENV_FILE" && [ -f "$PROD/.env" ]; then
  token=$(sed -n 's/^CLOUD_BUILDER_TOKEN=//p' "$PROD/.env" | tail -1)
  if [ -n "$token" ]; then
    sed -i "s/^CLOUD_BUILDER_TOKEN=$/CLOUD_BUILDER_TOKEN=$token/" "$ENV_FILE"
    echo "Copied CLOUD_BUILDER_TOKEN from $PROD/.env"
  fi
fi

log "Firewall and build images"
"$DIR/deploy/builder/firewall.sh"
cat >/etc/cron.daily/codeqlick-builder-images <<'CRON'
#!/bin/sh
# Keeps the build images current (architecture 8.4).
for v in 20 22 24; do docker pull -q "node:$v-bookworm-slim" >/dev/null 2>&1; done
CRON
chmod 0755 /etc/cron.daily/codeqlick-builder-images
/etc/cron.daily/codeqlick-builder-images || true

log "Sandbox check"
gateway=$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')
public=$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
# shellcheck disable=SC2016
probe='
const net = require("node:net");
const reach = (host, port) => new Promise((ok) => {
  const s = net.connect({ host, port, timeout: 3000 });
  s.on("connect", () => { s.destroy(); ok(true); });
  s.on("timeout", () => { s.destroy(); ok(false); });
  s.on("error", () => ok(false));
});
(async () => {
  const npm = await fetch("https://registry.npmjs.org/-/ping").then((r) => r.ok, () => false);
  const host = [];
  for (const [h, p] of [[process.env.GW, 22], [process.env.PUB, 22], [process.env.PUB, 443]])
    if (h && (await reach(h, p))) host.push(`${h}:${p}`);
  console.log(`npm: ${npm ? "reachable" : "UNREACHABLE"}; host: ${host.length ? "REACHABLE " + host.join(" ") : "blocked"}`);
  process.exit(npm && !host.length ? 0 : 1);
})();'
if ! docker run --rm --runtime runsc --network bridge --cap-drop ALL --security-opt no-new-privileges \
  -e GW="$gateway" -e PUB="$public" node:24-bookworm-slim node -e "$probe"; then
  echo "The sandbox check failed: the agent was not started." >&2
  exit 1
fi

log "Service"
install -m 0644 "$DIR/deploy/builder/codeqlick-builder.service" /etc/systemd/system/codeqlick-builder.service
systemctl daemon-reload
systemctl enable codeqlick-builder >/dev/null

if grep -q '^CLOUD_BUILDER_TOKEN=$' "$ENV_FILE"; then
  echo
  echo "Almost done: put CLOUD_BUILDER_TOKEN (the same as in the production .env) in"
  echo "$ENV_FILE, then: systemctl restart codeqlick-builder"
else
  systemctl restart codeqlick-builder
  echo "The agent is running: journalctl -u codeqlick-builder -f"
fi
