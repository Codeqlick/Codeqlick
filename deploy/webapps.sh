#!/bin/sh
# Prints Codeqlick's own web apps, one per line: the API's WEBAPPS list
# (codeqlick-backend/src/common/webapps.ts), the single source of truth.
set -eu
cd "$(dirname "$0")/.."
sed -n 's/^export const WEBAPPS = \[\(.*\)\] as const;$/\1/p' codeqlick-backend/src/common/webapps.ts |
  tr -d " '" | tr ',' '\n' | grep -E '^[a-z][a-z0-9-]{1,30}$'
