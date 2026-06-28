#!/usr/bin/env bash
# Sync backend .env to AWS EC2 and restart PM2.
set -euo pipefail

SSH_KEY="${1:-${CHATFLOW_AWS_SSH_KEY:-}}"
SSH_HOST="ubuntu@3.108.152.171"
REMOTE_ENV="/home/ubuntu/chatflow/backend/.env"
LOCAL_ENV="$(cd "$(dirname "$0")/.." && pwd)/backend/.env"

if [[ -z "${SSH_KEY}" ]]; then
  SSH_KEY="/c/Users/vijay/OneDrive/Documents/chatflow-aws.pem"
fi

if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: local backend/.env not found at ${LOCAL_ENV}" >&2
  exit 1
fi

echo "==> Uploading backend/.env to EC2"
scp -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${LOCAL_ENV}" "${SSH_HOST}:${REMOTE_ENV}"

echo "==> Applying AWS production settings and restarting PM2"
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${SSH_HOST}" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/chatflow/backend

# Same-origin via Nginx on HTTP — cookies must not require HTTPS.
if grep -q '^COOKIE_SECURE=' .env; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=false/' .env
else
  echo 'COOKIE_SECURE=false' >> .env
fi

if grep -q '^COOKIE_SAMESITE=' .env; then
  sed -i 's/^COOKIE_SAMESITE=.*/COOKIE_SAMESITE=lax/' .env
else
  echo 'COOKIE_SAMESITE=lax' >> .env
fi

sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=http://3.108.152.171,http://localhost,capacitor://localhost,ionic://localhost|' .env

# PM2 ecosystem still hardcodes OCI CORS — align with AWS host.
sed -i 's|https://140-245-209-196.sslip.io|http://3.108.152.171|g' ecosystem.config.cjs

echo "==> .env sanity check (values masked)"
for key in MONGO_URL DB_NAME JWT_SECRET CORS_ORIGINS COOKIE_SECURE COOKIE_SAMESITE S3_BUCKET AWS_ACCESS_KEY_ID; do
  if grep -q "^${key}=" .env; then
    val="$(grep -E "^${key}=" .env | cut -d= -f2- | tr -d '"')"
    if echo "${val}" | grep -qi replace; then
      echo "  ${key}=PLACEHOLDER"
    else
      echo "  ${key}=ok"
    fi
  else
    echo "  ${key}=MISSING"
  fi
done

pm2 delete chatflow-backend 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 3
echo "==> PM2 status"
pm2 list

echo "==> Port 8000"
ss -tlnp | grep ':8000' || { echo "ERROR: backend not listening on 8000"; pm2 logs chatflow-backend --lines 20 --nostream; exit 1; }

echo "==> API smoke test"
curl -s -o /dev/null -w "GET /api/auth/verify -> HTTP %{http_code}\n" http://127.0.0.1:8000/api/auth/verify
curl -s -o /dev/null -w "GET /api/auth/verify via nginx -> HTTP %{http_code}\n" http://127.0.0.1/api/auth/verify
REMOTE

echo "==> Backend should be live at http://3.108.152.171/api/"
