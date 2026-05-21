#!/usr/bin/env bash
# Cron-friendly Let's Encrypt renewal. Idempotent: skips renewal if cert not near expiry.
# DUCKDNS_TOKEN is sourced from /opt/webcrawler/.env.prod (gitignored on VM) if not set in env.
# Recommended cron entry (host crontab -e):
#   0 3,15 * * * /opt/webcrawler/scripts/renew-cert.sh >> /var/log/cert-renew.log 2>&1
set -euo pipefail

SECRETS_FILE="${SECRETS_FILE:-/opt/webcrawler/.env.prod}"
if [[ -z "${DUCKDNS_TOKEN:-}" && -f "${SECRETS_FILE}" ]]; then
  DUCKDNS_TOKEN="$(grep -E '^DUCKDNS_TOKEN=' "${SECRETS_FILE}" | cut -d'=' -f2- | tr -d '[:space:]')"
fi

: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN not set and not found in ${SECRETS_FILE}}"

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
