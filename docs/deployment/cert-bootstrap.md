# TLS Certificate Bootstrap — DNS-01 Order of Operations

Let's Encrypt requires a valid certificate **before** Nginx can start with the HTTPS
server block. We use DNS-01 (not HTTP-01) because:

1. HTTP-01 requires Nginx running and serving `/.well-known/acme-challenge/` —
   but Nginx cannot start without an existing cert. (Chicken-and-egg.)
2. DuckDNS exposes a token-based API that Certbot can write `_acme-challenge` TXT
   records against — no HTTP server required.

## Prerequisites

- DuckDNS account at https://www.duckdns.org with a subdomain registered
  (e.g., `mycrawler.duckdns.org`) pointing to the Oracle instance public IP
- DuckDNS token (32-character string shown on duckdns.org after sign-in)
- Email address for Let's Encrypt expiry notifications
- Oracle firewall opened per `docs/deployment/oracle-firewall.md` (Layer 1 ingress
  for port 443 — required for the eventual cert; not for issuance)

## Bootstrap Order

Execute on the Oracle ARM instance after `git pull`:

```bash
# 1. Create the external Docker volume that nginx + certbot share.
docker volume create letsencrypt

# 2. Issue the cert via DNS-01.
export DUCKDNS_DOMAIN=mycrawler.duckdns.org      # your subdomain
export DUCKDNS_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export CERT_EMAIL=you@example.com
./scripts/issue-cert.sh

# 3. Substitute the placeholder in nginx.conf with the real domain.
sed -i "s/<DUCKDNS_DOMAIN>/${DUCKDNS_DOMAIN}/g" nginx/nginx.conf

# 4. Now start the stack — nginx will find the cert under /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/.
docker compose -f docker-compose.prod.yml up -d
```

## Verify the Cert

```bash
docker run --rm -v letsencrypt:/etc/letsencrypt alpine ls -lh /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/
# Expected files: fullchain.pem, privkey.pem, cert.pem, chain.pem (symlinks to ../../archive/...)
```

From an external machine, after the stack is up:
```bash
curl -sv https://${DUCKDNS_DOMAIN}/health 2>&1 | grep -E "SSL certificate verify ok|issuer"
# Expected: "SSL certificate verify ok" and "issuer: ... Let's Encrypt ..."
```

## Renewal

Certs expire after 90 days. The `scripts/renew-cert.sh` is idempotent — it only
requests a new cert when the existing one is within 30 days of expiry.

Install the cron job ONCE on the Oracle host:
```bash
crontab -e
# Add this line (replace token):
0 3,15 * * * DUCKDNS_TOKEN=xxxxxxxx /opt/webcrawler/scripts/renew-cert.sh >> /var/log/cert-renew.log 2>&1
```

The job runs twice daily at 03:00 and 15:00 UTC. After successful renewal, the
script reloads Nginx so the new cert is served without dropping connections.

**First-time dry run** (recommended after installing the cron entry):
```bash
docker run --rm -v letsencrypt:/etc/letsencrypt -e DUCKDNS_TOKEN=$DUCKDNS_TOKEN \
  infinityofspace/certbot_dns_duckdns:latest renew --dry-run
# Expected: "Congratulations, all simulated renewals succeeded"
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed authorization procedure` during issue-cert.sh | DuckDNS token wrong OR DNS propagation slow — increase `--dns-duckdns-propagation-seconds` to 120 in `scripts/issue-cert.sh` |
| Nginx exits with `PEM_read_bio:no start line` | Cert files missing — re-run `./scripts/issue-cert.sh` |
| Nginx exits with `cannot load certificate ... <DUCKDNS_DOMAIN>` | Placeholder not substituted — run the `sed -i` step from bootstrap order |
| Renewal cron silently fails | Check `/var/log/cert-renew.log`; ensure `DUCKDNS_TOKEN` is set in the cron line |
