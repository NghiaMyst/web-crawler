#!/usr/bin/env bash
# One-shot Let's Encrypt cert issuance for DuckDNS subdomain via DNS-01 challenge.
# Required env vars: DUCKDNS_DOMAIN, DUCKDNS_TOKEN, CERT_EMAIL
# Usage: DUCKDNS_DOMAIN=mycrawler.duckdns.org DUCKDNS_TOKEN=xxxx CERT_EMAIL=you@example.com ./scripts/issue-cert.sh
set -euo pipefail

: "${DUCKDNS_DOMAIN:?Set DUCKDNS_DOMAIN (e.g. mycrawler.duckdns.org)}"
: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN (32-char token from https://www.duckdns.org)}"
: "${CERT_EMAIL:?Set CERT_EMAIL (for Lets Encrypt expiry notifications)}"

# Create the external letsencrypt volume if missing (idempotent).
docker volume inspect letsencrypt >/dev/null 2>&1 || docker volume create letsencrypt

echo "[issue-cert] Requesting cert for ${DUCKDNS_DOMAIN} via DNS-01..."

docker run --rm \
  -v letsencrypt:/etc/letsencrypt \
  -v /var/log/letsencrypt:/var/log/letsencrypt \
  infinityofspace/certbot_dns_duckdns:latest \
  certonly \
  --non-interactive \
  --agree-tos \
  --email "${CERT_EMAIL}" \
  --preferred-challenges dns \
  --authenticator dns-duckdns \
  --dns-duckdns-token "${DUCKDNS_TOKEN}" \
  --dns-duckdns-propagation-seconds 60 \
  -d "${DUCKDNS_DOMAIN}"

echo "[issue-cert] Cert issued. Files in letsencrypt volume at /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/"
