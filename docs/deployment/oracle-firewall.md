# Oracle Cloud Firewall — Two-Layer Configuration

Oracle Cloud uses two independent firewall layers. Both MUST allow ports 80 and 443
or external traffic will not reach the instance.

## Layer 1 — VCN Security List (Oracle Console)

1. Sign in to https://cloud.oracle.com
2. Navigate: **Networking → Virtual Cloud Networks → <your-vcn> → Security Lists → Default Security List**
3. Click **Add Ingress Rules** and add the following two rules:

| Stateless | Source Type | Source CIDR | IP Protocol | Source Port | Destination Port |
|-----------|-------------|-------------|-------------|-------------|------------------|
| No        | CIDR        | 0.0.0.0/0   | TCP         | All         | 80               |
| No        | CIDR        | 0.0.0.0/0   | TCP         | All         | 443              |

Click **Add Ingress Rules** to save.

**Verify:**
From an external machine (NOT the Oracle instance), run:
```bash
nmap -p 80,443 <oracle-public-ip>
```
Expected (before nginx is running): `80/tcp closed`, `443/tcp closed` (port reachable,
nothing bound yet — this proves the VCN allows the SYN through). If output shows
`filtered`, the VCN rule is missing or wrong.

## Layer 2 — Host iptables (Ubuntu on Ampere A1)

Source: https://gist.github.com/mrladeia/da43fc783610758c6dbcaba22b4f7acd

SSH into the Oracle instance, then run:

```bash
# Open ports 80 and 443 (insert at top of INPUT chain so they precede REJECT rules).
sudo iptables -I INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT

# Persist across reboots.
sudo apt-get update
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

**Verify rules saved:**
```bash
sudo iptables -L INPUT -n --line-numbers | grep -E "dpt:(80|443)"
```
Expected output: two `ACCEPT` lines for tcp dpt:80 and tcp dpt:443.

**Verify persistence across reboot:**
```bash
sudo reboot
# After reconnecting via SSH:
sudo iptables -L INPUT -n --line-numbers | grep -E "dpt:(80|443)"
```
Same two lines must still be present.

## Combined Smoke Test

After both layers are open AND Plan 10-05 has run `docker compose -f docker-compose.prod.yml up -d`:

```bash
# From an external machine:
curl -I http://<DUCKDNS_DOMAIN>/health
# Expected: HTTP/1.1 301 Moved Permanently  (redirect to HTTPS)

curl -sI https://<DUCKDNS_DOMAIN>/health
# Expected: HTTP/1.1 200 OK
```

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `curl` from external machine times out | VCN Security List rule missing |
| `curl` from external machine returns `connection refused` | Host iptables rule missing OR nginx not running |
| SSH works (port 22) but 80/443 don't | Only Layer 2 (iptables) needs fixing — Layer 1 must already allow 22 |
