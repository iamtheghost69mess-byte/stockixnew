# GitHub Actions deploy — full checklist

**Cloudflare already Active?** Use the ordered checklist: **[RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md](RUNBOOK_AFTER_CLOUDFLARE_ACTIVE.md)** (DNS → VPS → `.env` → compose → tests → GitHub secrets).

This document walks from zero to **automatic deploys on every push to `main`** (and optional manual runs). The workflow file is [workflows/deploy.yml](workflows/deploy.yml).

What the workflow does **on each run**:

1. Starts an SSH agent with your **private** key (from GitHub Secrets).
2. Connects to your **deploy host** (AWS EC2, Hostinger VPS, any SSH server) as `EC2_USER`.
3. On the server: `git pull`, loads **`infra/prod/.env`**, runs **`pnpm install`**, **`db:migrate`**, then **`docker compose up -d --build`** in **`infra/prod`**.

It does **not** create cloud VMs, Cloudflare, or your domain — those are prerequisites below.

---

## Part 0 — Any Linux VPS (e.g. Hostinger)

The workflow is **not AWS-specific**. If you use **Hostinger KVM** (or Hetzner, DigitalOcean, etc.), skip Terraform (`infra/terraform/` is AWS-only) and follow the same steps as Parts 3–7, with these mappings:

| Concept | On your Hostinger VPS |
|--------|-------------------------|
| Public IP | **`76.13.139.176`** (use for DNS **A** records and GitHub secret **`EC2_HOST`**) |
| SSH | **`ssh root@76.13.139.176`** — GitHub secret **`EC2_USER`** = **`root`** *or* create a **`deploy`** user with Docker access and use that instead of root |
| OS | **Ubuntu 24.04 LTS** is fine; install Docker + Compose v2 + git + Node/corepack per **`scripts/setup-ec2.sh`** / Docker docs |
| Firewall | Hostinger **Firewall rules: 0** means nothing is opened in the panel — add **TCP 22, 80, 443** (world or scoped IPs). Optionally mirror with **`ufw`** on the server |
| Repo path | Still **`/opt/stockix/app`** (clone + **`infra/prod/.env`** as documented) |
| AWS artifacts | **Ignore** Route 53, ECR, VPC — not used by this compose stack unless you add them yourself |

**Sizing:** Your **KVM 2** (2 vCPU, 8 GB RAM, 100 GB disk) is enough for control plane + Postgres + Traefik + first tenants; watch RAM when many tenant stacks run Docker.

### Sharing one VPS with another project

- **Filesystem:** Keep Stockix only under **`/opt/stockix/`** (clone, `services/bigcapital`, tenant envs). Do not mix other apps into that tree.
- **Docker:** `infra/prod/docker-compose.yml` sets **`name: stockix`** so containers/volumes are prefixed (**`stockix_*`**) and stay separate from another Compose project.
- **Postgres:** Stockix publishes **localhost:`POSTGRES_HOST_PORT`** (default **54330**). If another DB uses **54330**, change **`POSTGRES_HOST_PORT`** in **`.env`** and use the same port in **`DATABASE_URL`** when running migrations.
- **Ports 80 / 443 — important:** Only **one** reverse proxy can listen on **80** and **443** on the host. If another stack already owns **Traefik/nginx/Caddy** on those ports, you **cannot** start Stockix’s Traefik on the same ports until you either:
  - **Merge routing** into the **existing** edge proxy (add routers for `stockix.cloud` / `api.stockix.cloud` / `*.stockix.cloud` → Stockix services), and **remove** or **don’t start** Stockix’s Traefik service, or  
  - **Stop** the other service from binding **80/443** (not ideal if that site must stay up).

There is no conflict if the other project listens only on other ports and you front everything with **one** proxy.

---

## Part 1 — One-time: AWS server (optional)

### 1.1 Create the EC2 instance

You can use **Terraform** (`infra/terraform/`) or the AWS Console.

- **Region**: `us-east-1` (or match `aws_region` everywhere).
- **VPC**: e.g. `vpc-07d37493c57f237ea`.
- **Subnet**: a **public** subnet (route to an Internet Gateway) so the instance has a public IP or Elastic IP.
- **Security group**: allow **22** from **your IP only** (`x.x.x.x/32`), **80** and **443** from **0.0.0.0/0**.
- **AMI**: Ubuntu 22.04 LTS is assumed below (`EC2_USER` = `ubuntu`).
- **Instance size**: at least **t3.large** if you will run tenant Docker stacks; smaller is OK only for API + dashboard + Postgres smoke tests.
- **Key pair**: create or choose an existing key pair; you need the **`.pem`** file on your laptop for first SSH and for GitHub (see Part 3).

### 1.2 Elastic IP (recommended)

Attach an **Elastic IP** so the server’s public address does not change when you stop/start the instance. Use this IP in **Cloudflare** (Part 2).

### 1.3 Install Docker and Node tooling on the server

SSH in (replace host and key path):

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

On the server:

- Install **Docker Engine** + **Docker Compose plugin** (v2).
- Install **Node 20** and enable **corepack** / **pnpm** (the deploy script runs `corepack prepare pnpm@9.15.9` each time, but having Node available helps for debugging).

You can follow **`scripts/setup-ec2.sh`** for Ubuntu-style installs, or Docker’s official docs for your OS.

Verify:

```bash
docker --version
docker compose version
```

---

## Part 2 — One-time: DNS (Cloudflare)

Point **`stockix.cloud`** (and subdomains) at your server’s **public IP** (or Elastic IP).

Typical Cloudflare records (proxied “orange cloud” is fine):

| Type | Name | Content |
|------|------|--------|
| A | `@` | your EC2 IP |
| A | `www` | your EC2 IP |
| A | `api` | your EC2 IP |
| A | `*` | your EC2 IP (tenant subdomains) |

Create a **Cloudflare API token** with **Zone → DNS → Edit** for that zone. You will put it in **`CF_DNS_API_TOKEN`** on the server in **`infra/prod/.env`** (not in GitHub Secrets for the current workflow).

SSL/TLS mode: **Full (strict)** once Traefik has certificates.

---

## Part 3 — One-time: Clone repo on the server (fixed path)

The workflow assumes the repository lives at **`/opt/stockix/app`** and that **`git pull`** works.

### 3.1 Create directory and clone

On EC2 as `ubuntu` (or your user):

```bash
sudo mkdir -p /opt/stockix
sudo chown ubuntu:ubuntu /opt/stockix
cd /opt/stockix
git clone https://github.com/YOUR_ORG/stockixnew.git app
```

Use **HTTPS** with a [personal access token](https://github.com/settings/tokens) or **SSH deploy key** so `git pull` works **non-interactively**. Examples:

- **HTTPS + token in URL** (store token in a protected file; avoid committing):

  ```bash
  git clone https://YOUR_TOKEN@github.com/YOUR_ORG/stockixnew.git app
  ```

- **SSH deploy key** (recommended long term): add the **public** key to repo **Settings → Deploy keys** (read/write if you ever push from server; read-only is enough for pull-only).

### 3.2 Confirm default branch

Ensure **`main`** exists and tracks **`origin/main`**:

```bash
cd /opt/stockix/app
git branch -vv
git pull --ff-only
```

---

## Part 4 — One-time: Server env file (`infra/prod/.env`)

On the **server**:

```bash
cd /opt/stockix/app/infra/prod
cp .env.example .env
nano .env   # or vim
```

Fill at least:

| Variable | Purpose |
|----------|--------|
| `ROOT_DOMAIN` | e.g. `stockix.cloud` |
| `NEXT_PUBLIC_STOCKIX_API_URL` | e.g. `https://api.stockix.cloud` (must match public API URL) |
| `POSTGRES_PASSWORD` | Strong password |
| `POSTGRES_HOST_PORT` | Default `54330` — must match port published to **localhost** for migrations |
| `ACME_EMAIL` | Let’s Encrypt registration email |
| `CF_DNS_API_TOKEN` | Cloudflare DNS API token (Traefik DNS-01) |

Optional:

| Variable | Purpose |
|----------|--------|
| `STOCKIX_REPO` | If not using default bind mount; usually `/opt/stockix/app` |
| `CORS_ORIGINS` | Extra origins beyond what the API adds from `ROOT_DOMAIN` |

**Security:** Never commit `.env`. Keep it only on the server (and backups you control).

### 4.1 First manual deploy (recommended before GitHub Actions)

Still on the server:

```bash
cd /opt/stockix/app
corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile

set -a && source infra/prod/.env && set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"
pnpm --filter @repo/db db:migrate

cd infra/prod
docker compose --env-file .env up -d --build
```

Open `https://YOUR_DOMAIN` and `https://api.YOUR_DOMAIN/health` in a browser.

---

## Part 5 — GitHub repository secrets

In GitHub: **Repository → Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | What to paste |
|-------------|----------------|
| **`EC2_SSH_PRIVATE_KEY`** | Full contents of your **`.pem`** private key file, including `-----BEGIN ... PRIVATE KEY-----` and `-----END ... PRIVATE KEY-----`. Ensure the key matches the **public** key on the instance (key pair selected at launch). |
| **`EC2_HOST`** | Public IP or DNS name of the server (e.g. Elastic IP or `ec2-...compute.amazonaws.com`). |
| **`EC2_USER`** | SSH login: **`ubuntu`** for Ubuntu 22.04; **`ec2-user`** for Amazon Linux 2; adjust if you use another AMI. |

Notes:

- **`webfactory/ssh-agent`** expects the **private** key in **`EC2_SSH_PRIVATE_KEY`**.
- If SSH fails, check security group **port 22** allows **GitHub Actions runners** (outbound from GitHub is a large IP range — many teams use **0.0.0.0/0** on 22 **temporarily** for testing, then lock to a bastion or VPN; alternatively use **self-hosted runners** in your VPC).
- For a **stable** host string, prefer **Elastic IP** or a DNS name that points to it.

---

## Part 6 — Wire the workflow to your repo

The workflow triggers on:

- **Push** to branch **`main`**
- **Manual run**: **Actions → Deploy Stockix → Run workflow** (if `workflow_dispatch` is enabled in the workflow file)

Ensure your default branch is **`main`** and that you merge feature branches into **`main`** to trigger deploys.

---

## Part 7 — Verify CI/CD

1. Push a small commit to **`main`** (or run the workflow manually).
2. Open **Actions** tab → select **Deploy Stockix** → open the latest run.
3. Expand **Deploy over SSH**; you should see **`git pull`**, **`pnpm install`**, **`db:migrate`**, **`docker compose`** without errors.

If it fails:

| Symptom | Check |
|--------|--------|
| SSH permission denied | Key pair on instance vs secret; `EC2_USER`; SG port 22 |
| `git pull` failed | Clone URL, deploy key / token, branch **`main`** |
| `db:migrate` failed | Postgres container up; **`DATABASE_URL`** host port matches **`POSTGRES_HOST_PORT`**; password in `.env` |
| `docker compose` failed | Docker running; disk space; `.env` complete (`CF_DNS_API_TOKEN`, etc.) |

---

## Summary — what lives where

| Item | Where |
|------|--------|
| Application secrets & prod config | **Server only**: `/opt/stockix/app/infra/prod/.env` |
| SSH key for CI | **GitHub Secrets**: `EC2_SSH_PRIVATE_KEY`, plus `EC2_HOST`, `EC2_USER` |
| Source code | **GitHub** repo; server copy at **`/opt/stockix/app`** |

You do **not** need to duplicate **`infra/prod/.env`** in GitHub Secrets for the current workflow — the workflow loads it **on the server** after `git pull`.

---

## Optional hardening (later)

- Lock SSH to a **bastion** or **VPN** and use a **self-hosted** GitHub Actions runner in the VPC.
- Add **`workflow_dispatch`** + environment **protection rules** so production deploys require approval.
- Replace long-lived SSH with **SSM Session Manager** + a different deploy mechanism if your org forbids SSH keys in Secrets.
