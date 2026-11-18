#!/bin/sh
# Appends a findings summary of a SARIF file (counts by level and the first findings) to the job
# summary. Usage: sarif-summary.sh <title> <file.sarif>. Never fails the job: the scan step decides.
# A result's level is its own `level` or, when it has none (Semgrep), the default level of its rule.
set -eu

title="$1"
file="$2"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

{
  echo "### $title"
  if [ ! -s "$file" ]; then
    echo
    echo "No report was produced (the scan failed before it finished; see the step log)."
  elif ! jq -r '
      ([.runs[]?.tool.driver.rules[]? | {key: .id, value: (.defaultConfiguration.level // "warning")}]
        | from_entries) as $lv
      | [.runs[]?.results[]? | . + {lv: (.level // $lv[.ruleId // ""] // "note")}] as $r
      | "\n\($r | length) findings: \([$r[] | select(.lv == "error")] | length) error, "
        + "\([$r[] | select(.lv == "warning")] | length) warning, "
        + "\([$r[] | select(.lv != "error" and .lv != "warning")] | length) other.\n",
        (if ($r | length) > 0 then
          "| Level | Rule | Location |\n|---|---|---|",
          ($r | sort_by(if .lv == "error" then 0 elif .lv == "warning" then 1 else 2 end)
              | .[:20][]
              | "| \(.lv) | `\(.ruleId // "?")` | `\(.locations[0].physicalLocation.artifactLocation.uri // "?"):\(.locations[0].physicalLocation.region.startLine // 0)` |")
        else empty end)
    ' "$file" 2> /dev/null; then
    echo
    echo "The report could not be read as SARIF (see the step log and the uploaded artifact)."
  fi
  echo
} >> "$out" || true
