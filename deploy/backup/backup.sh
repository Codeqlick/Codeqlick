#!/bin/sh
# Dumps the database to /backups on start and then every BACKUP_INTERVAL_HOURS, deleting dumps
# older than BACKUP_KEEP_DAYS. Runs as the `backup` service of docker-compose.prod.yml; the
# connection comes from the standard PG* variables.
set -eu
umask 077

interval_hours="${BACKUP_INTERVAL_HOURS:-24}"
keep_days="${BACKUP_KEEP_DAYS:-14}"

while true; do
  file="/backups/codeqlick-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "backup written: $file ($(du -h "$file" | cut -f1))"
    # Old dumps are only removed after a new one succeeded, so a failing database never
    # leaves the folder empty.
    find /backups -name 'codeqlick-*.dump' -mtime +"$keep_days" -delete
  else
    rm -f "$file.tmp"
    echo "backup FAILED" >&2
  fi
  sleep "$((interval_hours * 3600))"
done
