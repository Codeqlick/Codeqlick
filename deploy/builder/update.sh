#!/bin/sh
# Updates the build agent from the repository it was cloned from (the production checkout on the
# production VPS, so run it after a deploy) and restarts it (architecture 8.4).
set -eu
git -C /opt/codeqlick-builder pull -q --ff-only
install -m 0644 /opt/codeqlick-builder/deploy/builder/codeqlick-builder.service /etc/systemd/system/codeqlick-builder.service
systemctl daemon-reload
systemctl restart codeqlick-builder
echo "Updated to $(git -C /opt/codeqlick-builder log --oneline -1)"
