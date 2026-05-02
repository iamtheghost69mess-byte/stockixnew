# Terraform — Stockix application server

Creates one **EC2** instance (Ubuntu 22.04) in your **existing VPC**, with a **security group** (SSH + 80/443) and optional **Elastic IP**.

Terraform does **not** install Docker or deploy Stockix — use `scripts/setup-ec2.sh` and `infra/prod/docker-compose.yml` on the instance after SSH.

## One-time prerequisites

1. **AWS CLI** or credentials in the environment (`aws configure` or OIDC in CI).
2. **Terraform** ≥ 1.5 (`terraform version`).
3. An EC2 **key pair** in `us-east-1` (same region as `aws_region`).
4. A **public subnet ID** in VPC `vpc_id` (Subnet must route `0.0.0.0/0` to an Internet Gateway).

Find subnet IDs in AWS Console: VPC → Subnets → filter by your VPC → pick a subnet that is “public”.

## Commands

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars (subnet, key name, your IP for SSH)

terraform init
terraform plan
terraform apply
```

After `apply`, use `public_ip` from the output for Cloudflare **A** records. Put `EC2_HOST` in GitHub Actions secrets for deploy.

## Destroy

```bash
terraform destroy
```

This terminates the instance and releases the Elastic IP if created.
