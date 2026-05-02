# Infrastructure

## Terraform (`terraform/`)

Optional **EC2 + security group + Elastic IP** in your existing VPC. See `terraform/README.md`.

## Production (`prod/`)

Docker Compose stack for **Traefik** (TLS via Cloudflare DNS-01 + routing), **Postgres**, **Stockix API**, and **dashboard**.

- Compose file: `infra/prod/docker-compose.yml`
- Env template: `infra/prod/.env.example` → copy to `infra/prod/.env`
- Server bootstrap: `scripts/setup-ec2.sh`
- CI/CD: `.github/workflows/deploy.yml` (SSH to EC2, migrate DB, `docker compose up -d --build`)

Run on the server from `infra/prod`:

```bash
docker compose --env-file .env up -d --build
```

Other layouts:

- Local control-plane DB only: `infra/dev/docker-compose.yml`
- Per-tenant Stockix: `infra/tenant-stack/docker-compose.yml`
