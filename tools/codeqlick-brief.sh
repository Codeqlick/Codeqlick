#!/bin/sh
# Prints a client project's brief (the client's answers about goals, audience, must-haves, brand,
# deadlines...) as Markdown, read with the project's release key. Needs curl and jq.
#
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-brief.sh            the Markdown
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-brief.sh --json     the raw answers
#
# CODEQLICK_API defaults to https://api.codeqlick.com/v1.
set -eu

: "${CODEQLICK_RELEASE_KEY:?set CODEQLICK_RELEASE_KEY to the release key of the project}"
api="${CODEQLICK_API:-https://api.codeqlick.com/v1}"
brief="$(curl -fsS "$api/brief" -H "Authorization: Bearer $CODEQLICK_RELEASE_KEY")"

if [ "${1:-}" = "--json" ]; then
  printf '%s\n' "$brief" | jq .
  exit 0
fi

# Questions in the portal's order, with the English wording of each one.
printf '%s\n' "$brief" | jq -r '
  def q: [
    ["business", "What the business does"],
    ["goals", "Goals"],
    ["success", "How success is measured"],
    ["audience", "Audience"],
    ["mustHave", "Must-have features"],
    ["niceToHave", "Nice to have"],
    ["references", "References"],
    ["brandStatus", "Brand (none / partial / complete)"],
    ["brandColors", "Colours"],
    ["brandTone", "Tone"],
    ["brandAssetsUrl", "Logo and brand material"],
    ["content", "Who prepares the content (client / codeqlick / both)"],
    ["domain", "Domain"],
    ["services", "Services and accounts"],
    ["deadline", "Target date"],
    ["deadlineReason", "Why that date"],
    ["other", "Anything else"]
  ];
  "# Brief: \(.project.name)",
  "",
  "Status: \(.status)" + (if .submittedAt then " (sent \(.submittedAt))" else "" end),
  "",
  (. as $b | q[] | select($b.answers[.[0]] != null and $b.answers[.[0]] != "")
    | "## \(.[1])\n\n\($b.answers[.[0]])\n")'
