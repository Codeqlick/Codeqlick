#!/bin/sh
# Keeps builds on the internet only (architecture 8.4, decision 41): from Docker's default bridge,
# where the build containers run, nothing reaches the host itself (its services, the TURN server on
# the bridge address) or a private or link-local network (the other projects' containers included).
# Idempotent; codeqlick-builder.service runs it as root before every start.
set -eu
IF=docker0

rule() {
  cmd=$1 chain=$2
  shift 2
  "$cmd" -C "$chain" "$@" 2>/dev/null || "$cmd" -I "$chain" "$@"
}

rule iptables INPUT -i "$IF" -j DROP
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16; do
  rule iptables DOCKER-USER -i "$IF" -d "$net" -j DROP
done
if command -v ip6tables >/dev/null 2>&1; then
  rule ip6tables INPUT -i "$IF" -j DROP
fi
