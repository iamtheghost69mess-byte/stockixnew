#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# VPS Provisioning Script — Hostinger KVM 2 (Ubuntu 24.04)
# Run as root: bash deploy/provision.sh
# Idempotent — safe to re-run.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

echo "════════════════════════════════════════"
echo "  VPS Provisioning — zerowix.cloud"
echo "════════════════════════════════════════"

# ── 1. System update ──
echo "▸ [1/12] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Essential packages ──
echo "▸ [2/12] Installing essentials..."
apt-get install -y --no-install-recommends \
    curl wget git build-essential ufw fail2ban htop unzip \
    software-properties-common ca-certificates gnupg lsb-release

# ── 3. Create deploy user ──
echo "▸ [3/12] Creating deploy user..."
if ! id deploy &>/dev/null; then
    useradd -m -s /bin/bash deploy
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
    chmod 0440 /etc/sudoers.d/deploy
    echo "  ✓ deploy user created"
else
    echo "  ✓ deploy user already exists"
fi

# Copy root's authorized_keys to deploy user (if exists)
if [ -f /root/.ssh/authorized_keys ]; then
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
    echo "  ✓ SSH keys copied to deploy user"
fi

# Create log directory
mkdir -p /home/deploy/logs
chown deploy:deploy /home/deploy/logs

# ── 4. Firewall (UFW) ──
echo "▸ [4/12] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
echo "  ✓ UFW active (22, 80, 443)"

# ── 5. Fail2ban ──
echo "▸ [5/12] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
bantime  = 3600
findtime = 600
EOF
systemctl enable fail2ban
systemctl restart fail2ban
echo "  ✓ fail2ban active (SSH: 5 retries, 1h ban)"

# ── 6. Swap (2GB) ──
echo "▸ [6/12] Configuring swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "  ✓ 2GB swap created"
else
    echo "  ✓ Swap already exists"
fi

# ── 7. Node.js 20 LTS ──
echo "▸ [7/12] Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "  ✓ Node.js $(node -v) installed"
else
    echo "  ✓ Node.js $(node -v) already installed"
fi

# ── 8. PM2 ──
echo "▸ [8/12] Installing PM2..."
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
    # Setup PM2 startup for deploy user
    env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
    echo "  ✓ PM2 installed + startup configured"
else
    echo "  ✓ PM2 already installed"
fi

# ── 9. Docker Engine ──
echo "▸ [9/12] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker deploy
    systemctl enable docker
    echo "  ✓ Docker + Compose installed"
else
    echo "  ✓ Docker already installed"
fi

# Docker log rotation
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
systemctl restart docker 2>/dev/null || true

# ── 10. Nginx ──
echo "▸ [10/12] Installing Nginx..."
if ! command -v nginx &>/dev/null; then
    apt-get install -y nginx
    systemctl enable nginx
    echo "  ✓ Nginx installed"
else
    echo "  ✓ Nginx already installed"
fi

# ── 11. SSL directory for Cloudflare Origin Cert ──
echo "▸ [11/12] Preparing SSL directory..."
mkdir -p /etc/ssl/cloudflare
chmod 700 /etc/ssl/cloudflare
echo "  ✓ /etc/ssl/cloudflare/ ready"
echo ""
echo "  ⚠  Next step: paste Cloudflare Origin Certificate files:"
echo "     /etc/ssl/cloudflare/zerowix.cloud.pem   (certificate)"
echo "     /etc/ssl/cloudflare/zerowix.cloud.key   (private key)"

# ── 12. Backup cron ──
echo "▸ [12/12] Setting up backup cron..."
cat > /etc/cron.daily/pos-backup <<'CRON'
#!/usr/bin/env bash
# Daily backup: Redis dump + uploads
set -euo pipefail
BACKUP_DIR="/home/deploy/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Redis
docker exec pos-redis redis-cli -a "${REDIS_PASSWORD:-changeme_in_production}" BGSAVE 2>/dev/null || true
sleep 2
docker cp pos-redis:/data/dump.rdb "$BACKUP_DIR/redis-dump.rdb" 2>/dev/null || true

# Uploads
docker cp pos-backend:/app/apps/pos-backend/uploads "$BACKUP_DIR/uploads" 2>/dev/null || true

# Retain 14 days
find /home/deploy/backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \;

chown -R deploy:deploy /home/deploy/backups
CRON
chmod +x /etc/cron.daily/pos-backup
echo "  ✓ Daily backup cron installed"

echo ""
echo "════════════════════════════════════════"
echo "  ✅ Provisioning complete!"
echo "════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Add your SSH public key to /home/deploy/.ssh/authorized_keys"
echo "  2. Install Cloudflare Origin Cert (see step 11 above)"
echo "  3. Copy Nginx config: cp deploy/nginx/zerowix.conf /etc/nginx/sites-available/"
echo "  4. Clone repo:  su - deploy && git clone https://github.com/jadh1/posnew.git"
echo "  5. Create .env:  cp deploy/.env.production.example apps/pos-backend/.env"
echo "  6. First deploy: bash deploy/deploy.sh"
echo ""
