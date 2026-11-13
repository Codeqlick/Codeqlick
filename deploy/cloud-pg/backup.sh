#!/bin/sh
# Dumps every Cloud database (cq_…) of cloud-pg daily to /backups/cloud-pg, keeping
# CLOUD_PG_KEEP_DAYS (architecture 4.13 "Databases", decision 47). Runs as the cloud-pg-backup
# service; the connection comes from the standard PG* variables.
set -eu
umask 077
keep_days="${CLOUD_PG_KEEP_DAYS:-7}"
mkdir -p /backups/cloud-pg

while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  for db in $(psql -d postgres -Atc "SELECT datname FROM pg_database WHERE datname ~ '^cq_[0-9a-f]{16}$'"); do
    file="/backups/cloud-pg/$db-$stamp.dump"
    if pg_dump --format=custom --dbname="$db" --file="$file.tmp"; then
      mv "$file.tmp" "$file"
    else
      rm -f "$file.tmp"
      echo "cloud backup FAILED: $db" >&2
    fi
  done
  echo "cloud databases dumped: $(find /backups/cloud-pg -name "*-$stamp.dump" | wc -l)"
  find /backups/cloud-pg -name 'cq_*.dump' -mtime +"$keep_days" -delete
  sleep 86400
done
