#!/bin/sh
# Reads and updates a client project's tasks on codeqlick.com from its repository, with the
# project's release key. Marking a task done resolves the support request it came from (the
# client is emailed). Needs curl and jq.
#
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh list        open tasks (default)
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh all         every task
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh show <id>   one task with its details
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh start <id>
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh done <id>
#   CODEQLICK_RELEASE_KEY=cqr_… tools/codeqlick-tasks.sh add "<title>" ["<details>"]
#
# CODEQLICK_API defaults to https://api.codeqlick.com/v1.
set -eu

: "${CODEQLICK_RELEASE_KEY:?set CODEQLICK_RELEASE_KEY to the release key of the project}"
api="${CODEQLICK_API:-https://api.codeqlick.com/v1}"
command="${1:-list}"

call() {
  method="$1"
  path="$2"
  shift 2
  curl -fsS -X "$method" "$api$path" \
    -H "Authorization: Bearer $CODEQLICK_RELEASE_KEY" \
    -H 'Content-Type: application/json' "$@"
}

# One line per task: id, status, title and the request it came from.
print_tasks() {
  jq -r '.[] | [.id, .status, .title, (if .ticket then "(request #\(.ticket.number))" else "" end)] | @tsv'
}

case "$command" in
  list) call GET '/tasks?status=open' | print_tasks ;;
  all) call GET '/tasks' | print_tasks ;;
  show)
    id="${2:?usage: show <task id>}"
    call GET '/tasks' | jq --arg id "$id" '.[] | select(.id == $id)'
    ;;
  start | done)
    id="${2:?usage: $command <task id>}"
    status="IN_PROGRESS"
    [ "$command" = "done" ] && status="DONE"
    call PATCH "/tasks/$id" -d "$(jq -n --arg s "$status" '{status: $s}')" |
      jq -r '"\(.status)\t\(.title)"'
    ;;
  add)
    title="${2:?usage: add <title> [details]}"
    call POST '/tasks' -d "$(jq -n --arg t "$title" --arg d "${3:-}" \
      '{title: $t} + (if $d != "" then {description: $d} else {} end)')" |
      jq -r '"\(.id)\t\(.title)"'
    ;;
  *)
    echo "Unknown command: $command (list, all, show, start, done, add)" >&2
    exit 1
    ;;
esac
