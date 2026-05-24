#!/usr/bin/env bash
# Run on YOUR LAPTOP (not the VPS). Creates an SSH key pair for GitHub Actions → VPS deploy.
# Usage: bash scripts/setup-github-actions-ssh.sh
#
# After this script:
# 1. Append the printed PUBLIC key to the VPS: ~/.ssh/authorized_keys (as root or deploy user).
# 2. GitHub → Repo → Settings → Secrets → Actions → add EC2_SSH_PRIVATE_KEY = contents of the PRIVATE key file.
# 3. Set EC2_HOST and EC2_USER (see printed summary).

set -euo pipefail

KEY_DIR="${HOME}/.ssh"
KEY_NAME="${KEY_NAME:-stockix_github_actions}"
KEY_PATH="${KEY_DIR}/${KEY_NAME}"

mkdir -p "${KEY_DIR}"
chmod 700 "${KEY_DIR}"

if [[ -f "${KEY_PATH}" ]]; then
  echo "Key already exists: ${KEY_PATH}"
  echo "Remove it first or set KEY_NAME to a different name."
  exit 1
fi

ssh-keygen -t ed25519 -f "${KEY_PATH}" -C "stockix-github-actions-$(date +%Y%m%d)"

echo ""
echo "========== ADD THIS LINE TO THE VPS (one line) =========="
echo "File: ${KEY_PATH}.pub — append to server ~/.ssh/authorized_keys"
echo "Tip: prepend options for least privilege (example):"
echo "command=\"/usr/bin/false\",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding <key>"
echo ""
cat "${KEY_PATH}.pub"
echo ""
echo "========== ON THE VPS (SSH as root or your user) =========="
echo "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
echo "nano ~/.ssh/authorized_keys   # paste the line above, save"
echo "chmod 600 ~/.ssh/authorized_keys"
echo ""
echo "========== TEST FROM LAPTOP =========="
echo "ssh -i ${KEY_PATH} root@YOUR_VPS_IP  echo ok"
echo ""
echo "========== GITHUB SECRETS (Repository → Settings → Secrets → Actions) =========="
echo ""
echo "Name: EC2_SSH_PRIVATE_KEY"
echo "Value: ENTIRE contents of this file (including BEGIN/END lines):"
echo "  ${KEY_PATH}"
echo ""
echo "Name: EC2_HOST"
echo "Value: Your VPS public IPv4 (e.g. 76.13.139.176)"
echo ""
echo "Name: EC2_USER"
echo "Value: SSH username (e.g. root or ubuntu)"
echo ""
echo "========== PRIVATE KEY — copy only to GitHub secret storage =========="
echo "${KEY_PATH}"
