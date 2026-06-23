#!/usr/bin/env bash
#
# Deploy ChatFlow to AWS EC2 (Ubuntu + Nginx + PM2).
#
# Usage:
#   ./scripts/deploy-aws.sh /path/to/chatflow-aws.pem
#   CHATFLOW_AWS_SSH_KEY=/path/to/chatflow-aws.pem ./scripts/deploy-aws.sh
#   ./scripts/deploy-aws.sh --skip-git-push /path/to/chatflow-aws.pem
#
# Requires: SSH access to the EC2 instance, repo cloned at /home/ubuntu/chatflow.

set -euo pipefail

SSH_HOST="ubuntu@3.108.152.171"
REMOTE_DIR="/home/ubuntu/chatflow"
SKIP_GIT_PUSH=false
SSH_KEY="${CHATFLOW_AWS_SSH_KEY:-${AWS_SSH_KEY:-}}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-git-push)
      SKIP_GIT_PUSH=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--skip-git-push] [ssh-key-path]"
      echo ""
      echo "  ssh-key-path   Path to chatflow-aws.pem (or set CHATFLOW_AWS_SSH_KEY / AWS_SSH_KEY)"
      echo "  --skip-git-push  Skip local git push; deploy only what is already on the remote"
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
    "/c/Users/vijay/OneDrive/Documents/chatflow-aws.pem" \
    "${HOME}/OneDrive/Documents/chatflow-aws.pem" \
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

echo "==> ChatFlow AWS deploy -> ${SSH_HOST} (${REMOTE_DIR})"
echo "==> Using SSH key: ${SSH_KEY}"

if [[ "${SKIP_GIT_PUSH}" == "false" ]]; then
  echo "==> [1/2] Pushing local changes to Git"
  cd "${REPO_ROOT}"
  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    echo "Warning: you have uncommitted local changes. Commit and push first, or pass --skip-git-push to deploy only what is already on the remote."
  fi
  BRANCH="$(git branch --show-current)"
  echo "==> git push origin ${BRANCH}"
  git push origin "${BRANCH}"
else
  echo "==> [1/2] Skipping git push (--skip-git-push)"
fi

echo "==> [2/2] Running remote deploy over SSH"

REMOTE_DEPLOY=$(cat <<EOF
set -e
echo '==> Remote: ensure swap for frontend build (small instances)'
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo '==> Remote: nginx path permissions'
chmod o+x /home/ubuntu /home/ubuntu/chatflow /home/ubuntu/chatflow/frontend

echo '==> Remote: entering ${REMOTE_DIR}'
cd ${REMOTE_DIR}

echo '==> Remote: git pull'
git checkout -- frontend/yarn.lock 2>/dev/null || true
git stash push -m deploy-autostash -- frontend/yarn.lock 2>/dev/null || true
git pull --ff-only

echo '==> Remote: backend — activate venv and install dependencies'
cd backend
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate

echo '==> Remote: backend — restart PM2 (chatflow-backend)'
pm2 restart chatflow-backend --update-env || pm2 start ecosystem.config.cjs
pm2 save

echo '==> Remote: frontend — npm install'
cd ../frontend
npm install --no-audit --no-fund

echo '==> Remote: frontend — npm run build'
export NODE_OPTIONS="--max-old-space-size=1536"
npm run build
chmod -R o+rX build

echo '==> Remote: nginx — test config and reload'
sudo nginx -t
sudo systemctl reload nginx

echo '==> Remote: deploy complete'
EOF
)

run_ssh "bash -s" <<< "${REMOTE_DEPLOY}"

echo "==> AWS deploy complete: https://vijay-chatflow.duckdns.org"
