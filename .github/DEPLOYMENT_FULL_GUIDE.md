# Stockix — full deployment guide (VPS + GitHub Actions)

Use this as the single checklist from **zero** to **HTTPS working** and **CI/CD**. Shorter paths: [RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md](RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md), [DEPLOYMENT.md](DEPLOYMENT.md).

### **GitHub Actions — what you actually add (exactly 3 secrets)**

The workflow **does not** use AWS keys, ECR, or Docker Hub. Add **only**:

| **Name** | **Value** |
|----------|-----------|
| **`EC2_SSH_PRIVATE_KEY`** | Contents of the **private** key file (`.pem`) that matches the **public** key allowed on the VPS for **`EC2_USER`**. |
| **`EC2_HOST`** | VPS IPv4 (e.g. `YOUR_VPS_IP`) or DNS hostname. |
| **`EC2_USER`** | SSH login name on the VPS (**`root`**, **`ubuntu`**, etc.). |

Repository → **Settings → Secrets and variables → Actions → New repository secret** (three rows).

---

## **A. Prerequisites**

| Item | **Why it matters** | **If wrong** |
|------|-------------------|----------------|
| **Domain** (e.g. `stockix.cloud`) | DNS + TLS names | Wrong URLs, ACME fails |
| **Cloudflare zone Active** | DNS + optional proxy | Pending NS → DNS dead |
| **VPS public IPv4** | A records + SSH | 404 / connection refused |
| **Repo on GitHub** with **`infra/prod/`** on **`main`** | `docker compose`, VPS `git pull` | **404 on raw.githubusercontent.com**, empty `git ls-files infra/prod` |
| **Ports 80 / 443 free** on VPS (or **one** reverse proxy only) | Traefik binds **80/443** | `address already in use` |

**Feedback:** If **`infra/prod` is missing on GitHub**, push from your dev machine (`git add infra/prod`, commit, push). The VPS cannot deploy without **`infra/prod/docker-compose.yml`**.

---

## **B. Cloudflare**

1. **Nameservers** at registrar → Cloudflare (zone **Active**).
2. **DNS → Records:** **A** `@`, `www`, `api`, `*` → **VPS IP**, Proxied if you use orange cloud.
3. **SSL/TLS → Full (strict)** (use **Full** only while fixing origin certs).
4. **API token** for Traefik (DNS-01): **My Profile → API Tokens →** create with **Zone → DNS → Edit** for your zone. Put token only in **`infra/prod/.env`** as **`CF_DNS_API_TOKEN`** — never commit.

**Feedback:** Leaked token → **revoke** and create a new one. **403** on git → PAT/SSH, not Cloudflare.

---

## **C. VPS — first boot**

**Bold checklist:**

1. **`ssh root@YOUR_IP`** (or deploy user).
2. **Firewall:** Hostinger panel + optional **`ufw`**: **TCP 22, 80, 443**.
3. **Stop conflicting nginx** on **80/443** if Stockix Traefik should own them:  
   `systemctl stop nginx && systemctl disable nginx` (only if safe).
4. **Install:** Docker Engine + **Compose v2**, **git**, **Node 20**, **`corepack` + pnpm**.
5. **Clone** repo to **`/opt/stockix/stockixnew`** (SSH deploy key or HTTPS + PAT).  
   **Optional symlink for CI:**  
   `ln -sfn /opt/stockix/stockixnew /opt/stockix/app`
6. **`infra/prod/.env`:** copy from **`.env.example`**, fill secrets (see section **E**).
7. **`pnpm install`** at repo root → **`docker compose`** in **`infra/prod`** only.

**Feedback:**

| Symptom | Likely cause |
|---------|----------------|
| **`Permission denied (publickey)`** | Deploy key not added on GitHub repo |
| **`Invalid username or token`** | Using GitHub **password** instead of **PAT** |
| **`403` on git** | No repo access; fix collaborator / token scopes |
| **`infra/prod` missing** | Not pushed to **GitHub** |
| **`no configuration file`** | Ran **`docker compose`** outside **`infra/prod`** |

---

## **D. Order of commands on the VPS (after clone + `.env`)**

Run **one block at a time**; paths assume **`/opt/stockix/stockixnew`**.

```bash
cd /opt/stockix/stockixnew
pnpm install --frozen-lockfile
```

```bash
cd /opt/stockix/stockixnew/infra/prod
docker compose --env-file .env up -d postgres
sleep 20
```

```bash
set -a && source /opt/stockix/stockixnew/infra/prod/.env && set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"
cd /opt/stockix/stockixnew
pnpm --filter @repo/db db:migrate
```

```bash
cd /opt/stockix/stockixnew/infra/prod
docker compose --env-file .env up -d --build
```

```bash
docker compose --env-file .env logs traefik --tail 80
```

**Browser:** `https://YOUR_DOMAIN` and `https://api.YOUR_DOMAIN/health`.

**Feedback:**

| Symptom | Likely cause |
|---------|----------------|
| **`drizzle-kit` / migrate fails** | Postgres not up; wrong **`DATABASE_URL`** password/port |
| **Traefik ACME errors** | **`CF_DNS_API_TOKEN`**, **`ACME_EMAIL`**, or DNS not pointing to VPS |
| **`connection refused` on 443** | Firewall; Traefik not running; port conflict |

---

## **E. `infra/prod/.env` (server only — do not commit)**

| Variable | **Required** | **Notes** |
|----------|--------------|-----------|
| **`ROOT_DOMAIN`** | Yes | e.g. `stockix.cloud` |
| **`NEXT_PUBLIC_STOCKIX_API_URL`** | Yes | e.g. `https://api.stockix.cloud` (dashboard build) |
| **`POSTGRES_USER`** | Yes | Usually `postgres` |
| **`POSTGRES_PASSWORD`** | Yes | Strong secret; matches migrate URL |
| **`POSTGRES_DB`** | Yes | Default `stockix_platform` |
| **`POSTGRES_HOST_PORT`** | Yes | Host port for Postgres (default **54330**); change if in use |
| **`ACME_EMAIL`** | Yes | Let’s Encrypt registration |
| **`CF_DNS_API_TOKEN`** | Yes | Cloudflare DNS API for Traefik |
| **`STOCKIX_REPO`** | Yes | Host path to repo, e.g. **`/opt/stockix/stockixnew`** |

Optional: **`CORS_ORIGINS`** (comma-separated).

**Feedback:** Pasting shell commands **inside** `.env` breaks **`source`** — file must be **`KEY=value`** lines only.

---

## **F. GitHub Actions — secrets (same 3 as above)**

Add under **Repository → Settings → Secrets and variables → Actions**.

| Secret | **What to paste** | **Feedback if wrong** |
|--------|---------------------|-------------------------|
| **`EC2_SSH_PRIVATE_KEY`** | Full **private** key (`.pem`), including `BEGIN`/`END` lines | **`Permission denied (publickey)`** — wrong key or user |
| **`EC2_HOST`** | VPS **public IPv4** or DNS | Connection timeout — firewall / wrong IP |
| **`EC2_USER`** | **`root`**, **`ubuntu`**, or your SSH user | **`Permission denied`** — user mismatch |

**Note:** Names say **EC2** but work for **any Linux SSH host** (e.g. Hostinger).

**Workflow behavior:** On **pull request**, GitHub runs quality checks only. On **push to `main`** or **manual “Deploy Stockix”**, GitHub SSHs to the server, **`git pull`**, **`source infra/prod/.env`**, **`pnpm install`**, **`db:migrate`**, **`docker compose up -d --build`**.

**Feedback:**

| Symptom | Likely cause |
|---------|----------------|
| **SSH fails from Actions** | **SG/firewall:** GitHub IPs need **:22** (or use self-hosted runner / VPN) |
| **`git pull` fails** | PAT/SSH on server; **`main`** not present |
| **`source infra/prod/.env` fails** | Missing/malformed **`.env`** on server |
| **`migrate` fails** | Postgres down; **`DATABASE_URL`** vs **`.env`** mismatch |
| **`docker compose` fails** | Not in **`infra/prod`**; Docker daemon stopped |

---

## **G. Verify everything on the server is live**

**Automated script** (on the VPS, after `infra/prod/.env` exists and stack is up):

```bash
chmod +x /opt/stockix/stockixnew/scripts/verify-stockix-server.sh   # once
STOCKIX_ROOT=/opt/stockix/stockixnew bash /opt/stockix/stockixnew/scripts/verify-stockix-server.sh
```

This prints **`docker compose ps`**, ports **80/443**, **API `/health`** from inside the **api** container, then **`https://api.$ROOT_DOMAIN/health`** and the dashboard URL if **`ROOT_DOMAIN`** is set.

**Manual checklist:**

| **Check** | **Expect** |
|-----------|------------|
| **`docker compose ps`** (in **`infra/prod`**) | **postgres**, **traefik**, **api**, **dashboard** = **running** / healthy |
| **`ss -tlnp \| grep ':80\|:443'`** | **docker-proxy** or **traefik** listening |
| **Browser** `https://YOUR_DOMAIN` | Dashboard loads |
| **Browser** `https://api.YOUR_DOMAIN/health` | JSON **`"status":"ok"`** |
| **GitHub Actions** “Deploy Stockix” | Green; SSH + **`git pull`** + **`docker compose`** succeed |

**Cloudflare:** SSL mode **Full (strict)** when origin HTTPS is valid.

---

## **H. Security reminders**

- **Never** commit **`infra/prod/.env`** or paste **tokens/passwords** in chat.
- **Rotate** any leaked Cloudflare or GitHub tokens.
- Prefer **SSH deploy keys** for server **`git clone`** / **`pull`**.

---

## **I. File map in this repo**

| Doc | Purpose |
|-----|---------|
| [workflows/deploy.yml](workflows/deploy.yml) | CI quality gate + production deploy |
| [workflows/secret-scan.yml](workflows/secret-scan.yml) | Gitleaks secret scanning |
| [PULL_REQUEST_TEMPLATE.md](PULL_REQUEST_TEMPLATE.md) | PR checklist |
| [dependabot.yml](dependabot.yml) | Dependency update automation |
| [CODEOWNERS](CODEOWNERS) | Review routing |
| [DEPLOYMENT.md](DEPLOYMENT.md) | AWS/VPS notes, shared VPS |
| [RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md](RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md) | Steps after Cloudflare Active |
| `infra/prod/docker-compose.yml` | Prod stack |
| `infra/prod/.env.example` | Template for server **`.env`** |
| `scripts/verify-stockix-server.sh` | On-VPS checks: compose, ports, health |

---

## **J. Release governance (required before merge to main)**

Configure branch protection using `docs/BRANCH_PROTECTION_SETUP.md` and enforce these required checks:

- `Quality gate`
- `Gitleaks Secret Scan`

Release sign-off checklist (must be confirmed for every production release):

1. Secrets rotation record updated in `infra/prod/OPERATIONS.md` when rotation happened.
2. DB migration + schema verification completed on target host.
3. Backup target (`BACKUP_B2_*`) verified non-empty and healthy.
4. Post-deploy script passes: `scripts/verify-stockix-server.sh`.
5. `/ready` and `/health` pass on public API endpoint.

---

## **K. Deployment targets (current and future)**

### Current baseline (single host + Docker Compose)

- Runtime: one Linux host, Docker Compose (`infra/prod/docker-compose.yml`)
- Secrets: host-local `infra/prod/.env` (never committed)
- Data plane: host Postgres + mounted volumes
- Gates: GitHub Actions `Quality gate` + `Gitleaks Secret Scan`

### Target baseline (managed cloud)

- Runtime: managed container platform (Kubernetes/ECS/App Service equivalent)
- Secrets: managed secret store (Vault/SM/KeyVault), no `.env` file distribution
- Data plane: managed PostgreSQL + managed Redis
- Observability: centralized logs/metrics/traces + alerting SLOs

### Parity requirements before cloud cutover

1. Same required CI gates and branch protection as current baseline.
2. Same `/ready` and `/health` semantics and rollout health checks.
3. Deterministic rollback path documented and tested.
4. Secret rotation runbook validated against managed secret store.
