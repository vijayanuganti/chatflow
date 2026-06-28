#!/usr/bin/env bash
#
# One-time bootstrap for ChatFlow on AWS EC2 (Ubuntu + Nginx + PM2 + Node 20).
#
# Usage:
#   ./scripts/bootstrap-aws.sh /path/to/chatflow-aws.pem
#   CHATFLOW_AWS_SSH_KEY=/path/to/chatflow-aws.pem ./scripts/bootstrap-aws.sh
#
# Installs Git, Nginx, Node.js v20, PM2, clones the repo to /home/ubuntu/chatflow,
# creates the Python virtual environment, and writes a basic Nginx site config.
# After bootstrap: configure backend/.env on the server, then run deploy-aws.sh.

set -euo pipefail

SSH_HOST="ubuntu@3.108.152.171"
REMOTE_DIR="/home/ubuntu/chatflow"
REPO_URL="${CHATFLOW_REPO_URL:-https://github.com/vijayanuganti/chatflow.git}"
SSH_KEY="${CHATFLOW_AWS_SSH_KEY:-${AWS_SSH_KEY:-}}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      echo "Usage: $0 [ssh-key-path]"
      echo ""
      echo "  ssh-key-path  Path to chatflow-aws.pem (or set CHATFLOW_AWS_SSH_KEY / AWS_SSH_KEY)"
      exit 0
      ;;
    *)
      if [[ -z "${SSH_KEY}" ]]; then
        SSH_KEY="$1"
      else
        echo "Error: unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "${SSH_KEY}" ]]; then
  for candidate in \
    "${HOME}/.ssh/chatflow-aws.pem" \
    "${REPO_ROOT}/chatflow-aws.pem" \
    "${REPO_ROOT}/scripts/chatflow-aws.pem"
  do
    if [[ -f "${candidate}" ]]; then
      SSH_KEY="${candidate}"
      break
    fi
  done
fi

if [[ -z "${SSH_KEY}" || ! -f "${SSH_KEY}" ]]; then
  echo "Error: SSH key not found. Pass it as \$1 or set CHATFLOW_AWS_SSH_KEY." >&2
  exit 1
fi

SSH_OPTS=(-i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new)

run_ssh() {
  ssh "${SSH_OPTS[@]}" "${SSH_HOST}" "$@"
}

echo "==> ChatFlow AWS bootstrap -> ${SSH_HOST}"
echo "==> Using SSH key: ${SSH_KEY}"
echo "==> Repo URL: ${REPO_URL}"
echo "==> Remote directory: ${REMOTE_DIR}"

REMOTE_BOOTSTRAP=$(cat <<EOF
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR}"
REPO_URL="${REPO_URL}"
PUBLIC_HOST="http://3.108.152.171"

echo '==> [1/7] Updating apt package index'
sudo apt-get update -qq

echo '==> [2/7] Installing Git, Nginx, Python venv, and build tools'
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git \
  nginx \
  curl \
  ca-certificates \
  python3 \
  python3-venv \
  python3-pip

echo '==> [3/7] Installing Node.js v20 (NodeSource)'
if ! command -v node >/dev/null 2>&1 || [[ "\$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
echo "    Node: \$(node -v)"
echo "    npm:  \$(npm -v)"

echo '==> [4/7] Installing PM2 globally'
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi
echo "    PM2: \$(pm2 -v)"

echo '==> [5/7] Cloning ChatFlow repository'
if [[ -d "\${REMOTE_DIR}/.git" ]]; then
  echo "    Repository already exists at \${REMOTE_DIR}; skipping clone"
else
  git clone "\${REPO_URL}" "\${REMOTE_DIR}"
fi

echo '==> [6/7] Creating Python virtual environment and installing backend deps'
cd "\${REMOTE_DIR}/backend"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "    Created backend/.env from .env.example — edit it before going live"
fi

echo '==> [7/9] Ensuring swap space (needed for CRA build on small instances)'
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo '    Created 2G swap at /swapfile'
else
  echo '    Swap already configured'
fi

echo '==> [8/9] Configuring Nginx for ChatFlow'
sudo tee /etc/nginx/sites-available/chatflow >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 3.108.152.171;

    root /home/ubuntu/chatflow/frontend/build;
    index index.html;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/chatflow /etc/nginx/sites-enabled/chatflow
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo '==> [9/9] Nginx path permissions (www-data must traverse /home/ubuntu)'
chmod o+x /home/ubuntu /home/ubuntu/chatflow /home/ubuntu/chatflow/frontend

echo ''
echo '==> Bootstrap complete on EC2'
echo "    Next steps:"
echo "    1. SSH in and edit \${REMOTE_DIR}/backend/.env (MongoDB, JWT, S3, CORS, etc.)"
echo "    2. Set CORS_ORIGINS to include \${PUBLIC_HOST} and capacitor origins"
echo "    3. From your machine, run: ./scripts/deploy-aws.sh /path/to/chatflow-aws.pem"
echo "       (first deploy builds the frontend and starts PM2)"
EOF
)

echo "==> Running remote bootstrap over SSH (this may take several minutes)..."
run_ssh "bash -s" <<< "${REMOTE_BOOTSTRAP}"

echo "==> AWS bootstrap finished: http://3.108.152.171"
echo "==> Remember to configure backend/.env on the server before deploying."
