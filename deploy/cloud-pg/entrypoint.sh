#!/bin/sh
# cloud-pg, the PostgreSQL of Codeqlick Cloud's managed databases (architecture 4.13
# "Databases", decision 47). Copies the hosting domain's wildcard certificate where PostgreSQL
# can read it (it must belong to postgres, 0600), again every 12 hours with a reload so renewals
# apply, then starts PostgreSQL with TLS only for the outside (pg_hba.conf).
set -eu

domain="${CLOUD_HOSTING_DOMAIN:?CLOUD_HOSTING_DOMAIN is needed for the certificate}"
source="/etc/letsencrypt/live/$domain"
tls=/var/lib/postgresql/tls

copy_certificate() {
  mkdir -p "$tls"
  cp -L "$source/fullchain.pem" "$tls/server.crt"
  cp -L "$source/privkey.pem" "$tls/server.key"
  chown -R postgres:postgres "$tls"
  chmod 0700 "$tls"
  chmod 0600 "$tls/server.key" "$tls/server.crt"
}

copy_certificate
(
  while sleep 43200; do
    copy_certificate && kill -HUP 1 || echo "certificate refresh FAILED" >&2
  done
) &

exec docker-entrypoint.sh postgres \
  -c ssl=on \
  -c ssl_cert_file="$tls/server.crt" \
  -c ssl_key_file="$tls/server.key" \
  -c ssl_min_protocol_version=TLSv1.2 \
  -c hba_file=/etc/cloud-pg/pg_hba.conf \
  -c password_encryption=scram-sha-256 \
  -c listen_addresses='*' \
  -c max_connections=300 \
  -c shared_buffers=512MB \
  -c temp_file_limit=1GB \
  -c log_connections=on \
  -c log_min_duration_statement=10s
