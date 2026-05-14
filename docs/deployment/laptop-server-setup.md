# Laptop Server Setup — Home Machine Replacement for Oracle A1

This guide turns an old laptop into a production server for the web crawler stack.
Follow parts top-to-bottom before picking up at Step 2 of `production-deploy.md`.

**Estimated time:** 45–90 minutes depending on Ubuntu install speed.

---

## Part 0 — Minimum Requirements Check

Before starting, confirm the laptop meets these minimums:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores (x86_64 or ARM64) | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB free | 80 GB free |
| OS | Ubuntu 22.04+ (fresh install preferred) | Ubuntu 22.04 LTS |
| Network | Wired Ethernet | Wired Ethernet (Wi-Fi works but less reliable) |

> **Why 4 GB minimum?** Playwright (used by the crawler) alone needs ~1 GB. Add
> PostgreSQL (~300 MB), Redis (~100 MB), .NET API (~200 MB), and Nginx — you hit
> 2–3 GB under load. 4 GB gives headroom.

---

## Part 1 — Ubuntu 22.04 Installation

Skip this part if Ubuntu 22.04 is already installed.

1. Download Ubuntu 22.04 LTS ISO: https://ubuntu.com/download/server
   - Choose **Server** (no GUI — saves ~2 GB RAM)
2. Flash to a USB drive:
   ```bash
   # On your current machine (Linux/Mac):
   sudo dd if=ubuntu-22.04-live-server-amd64.iso of=/dev/sdX bs=4M status=progress
   # Replace /dev/sdX with your USB device (check with: lsblk)
   ```
   Or use [Rufus](https://rufus.ie) on Windows.
3. Boot the laptop from USB (usually F12 or F2 at startup for boot menu)
4. Follow the installer:
   - **Profile:** set username `ubuntu`, hostname something like `webcrawler`
   - **SSH:** tick **Install OpenSSH server** — required for remote access
   - **Storage:** use the entire disk (erase and install)
5. Reboot after install; remove USB when prompted

---

## Part 2 — First Boot Configuration

SSH in from your main machine, or work directly on the laptop:

### 2.1 — Update the system

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo reboot
```

### 2.2 — Disable sleep and hibernation (critical for a server)

A laptop will suspend when idle or when the lid is closed — this kills the server.
Run these after reconnecting via SSH post-reboot:

```bash
# Disable all sleep/hibernate targets
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Prevent lid-close from suspending (edit logind config)
sudo sed -i 's/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/#HandleLidSwitchExternalPower=suspend/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf

# Apply without reboot
sudo systemctl restart systemd-logind
```

Verify:
```bash
systemctl status sleep.target
# Expected: loaded (masked)
```

### 2.3 — Get the laptop's local IP address

```bash
ip -4 addr show | grep inet
# Look for something like: inet 192.168.1.105/24 brd ... (your LAN IP)
```

Note this IP — you'll need it for router port forwarding in Part 3.
Example: `192.168.1.105`

### 2.4 — Set a DHCP reservation (so local IP never changes)

Do this on your **home router admin page** (usually http://192.168.1.1 or http://192.168.0.1):

1. Find **DHCP → Address Reservation** (name varies by router brand)
2. Add a reservation: bind your laptop's MAC address to a fixed local IP
   - Get the MAC: `ip link show | grep ether` (looks like `aa:bb:cc:dd:ee:ff`)
3. Save and reboot the router or re-connect the laptop

This ensures port forwarding (Part 3) always points to the right machine.

### 2.5 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Log out and back in for the group to take effect, then verify:
```bash
docker run hello-world
```

### 2.6 — Configure UFW firewall (Ubuntu's host firewall)

```bash
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
# Expected: 22, 80, 443 all ALLOW
```

---

## Part 3 — Home Router Port Forwarding

This exposes ports 80 and 443 on the laptop to the internet.

### 3.1 — Open your router admin page

- Common addresses: `http://192.168.1.1` or `http://192.168.0.1`
- Login credentials are usually on a sticker on the back of the router

### 3.2 — Add port forwarding rules

Find **Port Forwarding** / **Virtual Server** / **NAT** (varies by brand):

| External Port | Internal IP | Internal Port | Protocol |
|---------------|-------------|---------------|----------|
| 80 | 192.168.1.105 | 80 | TCP |
| 443 | 192.168.1.105 | 443 | TCP |

Replace `192.168.1.105` with your actual laptop LAN IP from Step 2.3.

Save and apply.

### 3.3 — Find your home public IP

```bash
curl -s https://api.ipify.org
# Returns your current public IP, e.g.: 203.0.113.42
```

### 3.4 — Verify from an external machine

Use your phone on mobile data (not Wi-Fi — must be outside your home network):
```bash
# From phone or another external machine:
nmap -p 80,443 <your-public-ip>
# Expected: 80/tcp closed  443/tcp closed
# "closed" = reachable but nothing bound yet (correct at this stage)
# "filtered" = port forwarding not working yet
```

---

## Part 4 — DuckDNS Setup

Your home IP changes periodically. DuckDNS keeps your domain pointed at the
current IP automatically.

### 4.1 — Create subdomain

1. Go to https://www.duckdns.org → sign in
2. Under **domains**, type a name (e.g., `mycrawler`) → **add domain**
3. Set the **current ip** to your public IP from Step 3.3 → **update ip**
4. **Record your token** — the 32-character string at the top of the page

### 4.2 — Install auto-update cron on the laptop

This runs every 5 minutes and updates DuckDNS if your home IP changes:

```bash
# Create the update script
sudo mkdir -p /opt/duckdns
sudo tee /opt/duckdns/update.sh > /dev/null << 'EOF'
#!/bin/bash
DOMAIN="mycrawler"          # change to your subdomain (without .duckdns.org)
TOKEN="your-32-char-token"  # change to your token
curl -s "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" \
  -o /var/log/duckdns.log
EOF

# Replace placeholders
sudo nano /opt/duckdns/update.sh   # edit DOMAIN and TOKEN

sudo chmod +x /opt/duckdns/update.sh

# Test it manually first
sudo bash /opt/duckdns/update.sh
cat /var/log/duckdns.log
# Expected: OK
```

Install the cron job:
```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * sudo bash /opt/duckdns/update.sh") | crontab -
crontab -l  # verify it's there
```

### 4.3 — Verify DNS resolves to your public IP

```bash
# Wait ~1 minute, then:
nslookup mycrawler.duckdns.org
# Expected: Address: <your public IP>
```

---

## Part 5 — Hand Off to Main Runbook

The laptop is now equivalent to the Oracle A1 instance. Continue from **Step 2**
of `production-deploy.md`, using:

- **Server address:** `ubuntu@<your-public-ip>` (or `ubuntu@mycrawler.duckdns.org` once DNS works)
- **Deploy root:** `/opt/webcrawler` (same as the runbook assumes)
- **`DUCKDNS_DOMAIN`:** `mycrawler.duckdns.org`

Steps already done that you can skip:
- Oracle VCN Security List → replaced by router port forwarding (Part 3)
- Host iptables → replaced by UFW (Step 2.6) — **but still run the iptables commands**
  from `oracle-firewall.md` Layer 2 because Docker bypasses UFW on some Ubuntu versions:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Can't SSH after setup | UFW not allowing port 22 | `sudo ufw allow ssh` before enabling UFW |
| Laptop suspends after ~10 min | logind config not applied | Re-run Step 2.2, check `HandleLidSwitch=ignore` in `/etc/systemd/logind.conf` |
| `nmap` shows `filtered` on 80/443 | Router port forwarding not saved / wrong LAN IP | Re-check Part 3; verify DHCP reservation |
| DuckDNS cron log shows `KO` | Wrong token or domain in update.sh | Re-edit `/opt/duckdns/update.sh` |
| Docker commands need `sudo` | User not in docker group | `sudo usermod -aG docker ubuntu` then re-login |
| Port forwarding works but cert fails | Home ISP blocks port 80 (some ISPs do) | Use port 8080 for HTTP-01; or use DNS-01 (already the default in this project) — DNS-01 does NOT need port 80 for cert issuance |

---

## Notes on Home Server Reliability

- **Power:** plug into a UPS or at minimum a surge protector
- **Keep the lid open** or close it after confirming `HandleLidSwitch=ignore` works
- **ISP dynamic IP:** the DuckDNS cron handles this, but cert renewal may fail if the IP
  changes between the cron run and Certbot's check — this is rare but possible; the
  `renew-cert.sh` uses DNS-01 which does not depend on your IP, so renewals are safe
- **Uptime:** home internet can go down; this is acceptable for a personal project but
  not for anything customer-facing
