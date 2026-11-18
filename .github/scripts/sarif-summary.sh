#!/bin/sh
# Appends a findings summary of a SARIF file (counts by level and the first findings) to the job
# summary. Usage: sarif-summary.sh <title> <file.sarif>. Never fails the job: the scan step decides.
set -eu

title="$1"
file="$2"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

{
  echo "### $title"
  if [ ! -s "$file" ]; then
    echo
    echo "No report was produced (the scan failed before it finished; see the step log)."
  else
    jq -r '
      [.runs[].results[]?] as $r
      | "\n\($r | length) findings: \([$r[] | select(.level == "error")] | length) error, "
        + "\([$r[] | select(.level == "warning")] | length) warning, "
        + "\([$r[] | select(.level != "error" and .level != "warning")] | length) other.\n",
        (if ($r | length) > 0 then
          "| Level | Rule | Location |\n|---|---|---|",
          ($r | sort_by(if .level == "error" then 0 elif .level == "warning" then 1 else 2 end)
              | .[:20][]
              | "| \(.level // "note") | `\(.ruleId)` | `\(.locations[0].physicalLocation.artifactLocation.uri // "?"):\(.locations[0].physicalLocation.region.startLine // 0)` |")
        else empty end)
    ' "$file"
  fi
  echo
} >> "$out"
