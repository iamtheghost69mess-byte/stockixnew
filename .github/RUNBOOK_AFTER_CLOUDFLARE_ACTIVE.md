# Runbook: steps after Cloudflare zone is **Active** (`stockix.cloud`)

Assume **stockix.cloud** is already **Active** in Cloudflare. Follow **in order**.

---

## Step 1 — DNS records (Cloudflare)

**DNS → Records** for `stockix.cloud`. Use **your VPS IPv4** everywhere (replace `YOUR_VPS_IP` with your server address).

| Type | Name | Content | Proxy |
|------|------|---------|--------|
| A | `@` | `YOUR_VPS_IP` | Proxied |
| A | `www` | `YOUR_VPS_IP` or CNAME → `stockix.cloud` | Proxied |
| A | `api` | `YOUR_VPS_IP` | Proxied |
| A | `*` | `YOUR_VPS_IP` | Proxied |

Save all. Wait ~1–5 minutes for propagation.

---

## Step 2 — SSL mode (Cloudflare)

**SSL/TLS → Overview** → **Full (strict)** (use **Full** temporarily only if origin cert is not ready yet).

---

## Step 3 — API token for Let’s Encrypt DNS-01 (Traefik)

**My Profile → API Tokens → Create Token.**

- Permission: **Zone → DNS → Edit**
- Zone: **stockix.cloud** only

Copy the token once → you will paste it as **`CF_DNS_API_TOKEN`** on the server (Step 8).

---

## Step 4 — VPS firewall (Hostinger + Ubuntu)

**Hostinger panel → Firewall:** allow **TCP 22**, **80**, **443** (and tighten **22** to your IP later if you want).

On the VPS (optional but recommended):

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Step 5 — SSH into the VPS

```bash
ssh root@YOUR_VPS_IP
```

(Use your real user if not `root`.)

### Shared VPS check (only if another app uses this server)

```bash
ss -tlnp | grep -E ':80|:443'
```

- **Empty** → OK to run Stockix Traefik on 80/443.
- **Something listening** → you cannot start a **second** reverse proxy on 80/443. **Typical on Hostinger: `nginx` is already using 80/443** (you will see `nginx` in the `ss` output).

#### If `nginx` is listening (your case)

Only **one** program can own ports **80** and **443**.

**Path A — This VPS is (or can be) only for Stockix**

1. See what nginx serves (optional):

   ```bash
   ls -la /etc/nginx/sites-enabled/
   nginx -T 2>/dev/null | head -80
   ```

2. If you **do not** need other sites on this box, free the ports and continue this runbook:

   ```bash
   systemctl stop nginx
   systemctl disable nginx
   ss -tlnp | grep -E ':80|:443'   # should be empty
   ```

3. Install Docker and continue from **Step 6**. Stockix **Traefik** will bind **80/443** when you run `docker compose up`.

**Path B — You must keep nginx** (other domains/projects)

Do **not** run Stockix’s Traefik on **80/443** until a professional integrates either:

- **nginx** as the only public listener and **reverse proxy** to Stockix containers / internal Traefik, or  
- moving Stockix to **another VPS** with free **80/443**.

That setup is custom (server blocks + upstreams + TLS). The default compose file assumes Traefik owns **80/443**.

---

## Step 6 — Install Docker, Git, Node, pnpm

Install **Docker Engine** + **Docker Compose v2** ([Docker Ubuntu docs](https://docs.docker.com/engine/install/ubuntu/)), then:

```bash
apt update && apt install -y git
# Node 20 from NodeSource or distro — then:
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

Verify:

```bash
docker --version && docker compose version && git --version && pnpm -v
```

---

## Step 7 — Clone Stockix to `/opt/stockix/app`

```bash
mkdir -p /opt/stockix
cd /opt/stockix
git clone https://github.com/YOUR_ORG/stockixnew.git app
cd /opt/stockix/app
git checkout main
```

Ensure **`git pull`** works without a password (deploy key or HTTPS token). Test:

```bash
git pull --ff-only
```

---

## Step 8 — Create `infra/prod/.env`

```bash
cd /opt/stockix/app/infra/prod
cp .env.example .env
nano .env
```

Set at least:

| Variable | Example |
|----------|---------|
| `ROOT_DOMAIN` | `stockix.cloud` |
| `NEXT_PUBLIC_STOCKIX_API_URL` | `https://api.stockix.cloud` |
| `POSTGRES_PASSWORD` | strong secret |
| `POSTGRES_HOST_PORT` | `54330` (change if that port is taken) |
| `ACME_EMAIL` | your email |
| `CF_DNS_API_TOKEN` | token from Step 3 |
| `STOCKIX_REPO` | `/opt/stockix/app` |

Save and exit.

---

## Step 9 — First deploy (migrations + Docker Compose)

```bash
cd /opt/stockix/app
pnpm install --frozen-lockfile

# IMPORTANT: Never use 'source infra/prod/.env' — semicolons in values break bash.
. scripts/load-env-file.sh infra/prod/.env
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"
pnpm --filter @repo/db db:migrate

cd infra/prod
docker compose --env-file .env up -d --build
```

Watch Traefik / ACME:

```bash
docker compose logs traefik --tail 100
```

Fix any **DNS token** or **rate limit** errors, then re-run **`up -d`** if needed.

---

## Step 10 — Smoke tests (browser)

- `https://stockix.cloud` → dashboard  
- `https://api.stockix.cloud/health` → `{"status":"ok"}`  

---

## Step 11 — GitHub Actions (automatic deploys)

In **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `EC2_HOST` | your VPS IP (name is legacy; works for any SSH host) |
| `EC2_USER` | `root` or deploy user |
| `EC2_SSH_PRIVATE_KEY` | private key matching server SSH auth |

Push to **`main`**, or **Actions → Deploy Stockix → Run workflow**.

---

## Done

You have DNS → TLS at edge → origin Traefik + Postgres + API + dashboard → optional CI deploys.

For troubleshooting, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.
