#!/usr/bin/env bash
# Bootstrap an Ubuntu 22.04/24.04 or Amazon Linux 2023 EC2 instance for Stockix.
# Run once as root or with sudo. Clone the repo yourself or pass STOCKIX_REPO_URL.
#
# Usage:
#   sudo STOCKIX_REPO_URL=git@github.com:org/stockixnew.git bash scripts/setup-ec2.sh

set -euo pipefail

STOCKIX_REPO_URL="${STOCKIX_REPO_URL:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/stockix/app}"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

apt_update() {
  apt-get update -y
}

install_debian() {
  apt_update
  apt-get install -y ca-certificates curl git gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  ARCH="$(dpkg --print-architecture)"
  UBUNTU_CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list

  apt_update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  apt-get install -y nodejs npm
}

install_amzn() {
  yum install -y git
  amazon-linux-extras install docker -y || dnf install -y docker
  systemctl enable docker
  systemctl start docker
  yum install -y nodejs npm || dnf install -y nodejs npm
}

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
else
  echo "Cannot detect OS." >&2
  exit 1
fi

case "${ID:-}" in
  ubuntu | debian)
    install_debian
    ;;
  amzn)
    install_amzn
    ;;
  *)
    echo "Unsupported ID=${ID}. Install Docker 24+, Compose v2, Node 20, git manually." >&2
    exit 1
    ;;
esac

systemctl enable docker 2>/dev/null || true
systemctl start docker

corepack enable
corepack prepare pnpm@9.15.9 --activate

mkdir -p "$(dirname "${INSTALL_DIR}")"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  if [[ -z "${STOCKIX_REPO_URL}" ]]; then
    echo "Set STOCKIX_REPO_URL or clone ${INSTALL_DIR} yourself before continuing." >&2
    exit 1
  fi
  git clone "${STOCKIX_REPO_URL}" "${INSTALL_DIR}"
fi

echo "Done. Next on the server:"
echo "  1. cd ${INSTALL_DIR}/infra/prod && cp .env.example .env && nano .env"
echo "  2. cd ${INSTALL_DIR} && pnpm install --frozen-lockfile"
echo "  3. source infra/prod/.env && export DATABASE_URL=postgresql://... && pnpm --filter @repo/db db:migrate"
echo "  4. cd ${INSTALL_DIR}/infra/prod && docker compose --env-file .env up -d --build"
