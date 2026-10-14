#!/bin/sh
# Dumps the database to /backups on start and then every BACKUP_INTERVAL_HOURS, deleting dumps
# older than BACKUP_KEEP_DAYS, and copies the uploaded files to /backups/uploads. Runs as the
# `backup` service of docker-compose.prod.yml; the connection comes from the standard PG*
# variables.
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

  # Uploaded files (images, and project files in project-files/) never change once written, so
  # new ones are added to a mirror instead of being archived again every day. Nothing is ever
  # removed from it: a file deleted from the admin panel stays recoverable here.
  if [ -d /uploads ]; then
    mkdir -p /backups/uploads
    if cp -pRu /uploads/. /backups/uploads/; then
      echo "uploads mirrored: $(find /backups/uploads -type f | wc -l) files"
    else
      echo "uploads mirror FAILED" >&2
    fi
  fi
  sleep "$((interval_hours * 3600))"
done
