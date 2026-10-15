#!/bin/sh
# Sends a draft update to a client project's page on codeqlick.com, built from the commits since a
# git ref. The team reviews it in the admin panel before the client sees anything. Copy this file
# into a client project (or call it from its CI); it needs git, curl and jq.
#
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-draft.sh "Catálogo terminado" [since-ref]
#
# since-ref: where the summary starts (default: the latest tag, or the whole history without one).
# Optional environment:
#   CODEQLICK_VERSION      makes it a release (e.g. v1.2.0); needs CODEQLICK_ENVIRONMENT
#   CODEQLICK_ENVIRONMENT  STAGING or PRODUCTION
#   CODEQLICK_URL          where the client can try it
#   CODEQLICK_API          default https://api.codeqlick.com/v1
#   DRY_RUN=1              print the JSON instead of sending it
set -eu

title="${1:?usage: codeqlick-draft.sh <title> [since-ref]}"
since="${2:-$(git describe --tags --abbrev=0 2>/dev/null || true)}"
api="${CODEQLICK_API:-https://api.codeqlick.com/v1}"

# One line per commit subject, merges left out, oldest first. Conventional Commit prefixes
# ("feat(ui): ", "fix: ") are dropped and the first letter capitalised: it is a first draft for the
# client, to be reworded in the review.
range="${since:+$since..}HEAD"
body="$(git log --no-merges --reverse --pretty='%s' "$range" |
  sed -E 's/^[a-z]+(\([^)]*\))?!?: //' |
  awk '{ print "- " toupper(substr($0, 1, 1)) substr($0, 2) }')"
[ -n "$body" ] || { echo "No commits since ${since:-the start}: nothing to send." >&2; exit 1; }

payload="$(jq -n \
  --arg title "$title" \
  --arg body "$body" \
  --arg version "${CODEQLICK_VERSION:-}" \
  --arg environment "${CODEQLICK_ENVIRONMENT:-}" \
  --arg url "${CODEQLICK_URL:-}" \
  '{title: $title, body: $body}
   + (if $version != "" then {version: $version, environment: $environment} else {} end)
   + (if $url != "" then {url: $url} else {} end)')"

if [ "${DRY_RUN:-}" = "1" ]; then
  printf '%s\n' "$payload"
  exit 0
fi

: "${CODEQLICK_RELEASE_KEY:?set CODEQLICK_RELEASE_KEY to the release key of the project}"
curl -fsS -X POST "$api/drafts" \
  -H "Authorization: Bearer $CODEQLICK_RELEASE_KEY" \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null
echo "Draft sent: review it on the project's page in the Codeqlick admin panel."
