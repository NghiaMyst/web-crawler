#!/usr/bin/env bash
# Cron-friendly Let's Encrypt renewal. Idempotent: skips renewal if cert not near expiry.
# Required env vars: DUCKDNS_TOKEN (renewal uses the saved domain list automatically)
# Recommended cron entry (host crontab -e):
#   0 3,15 * * * DUCKDNS_TOKEN=xxxx /opt/webcrawler/scripts/renew-cert.sh >> /var/log/cert-renew.log 2>&1
set -euo pipefail

: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN}"

COMPOSE_FILE="${COMPOSE_FILE:-/opt/webcrawler/docker-compose.prod.yml}"

echo "[renew-cert] $(date -Iseconds) — running certbot renew"

docker run --rm \
  -v letsencrypt:/etc/letsencrypt \
  -v /var/log/letsencrypt:/var/log/letsencrypt \
  -e DUCKDNS_TOKEN="${DUCKDNS_TOKEN}" \
  infinityofspace/certbot_dns_duckdns:latest \
  renew --quiet --no-random-sleep-on-renew

echo "[renew-cert] Reloading nginx..."
docker compose -f "${COMPOSE_FILE}" exec -T nginx nginx -s reload

echo "[renew-cert] $(date -Iseconds) — done"
