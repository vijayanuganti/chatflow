#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/chatflow/backend

echo "==> PM2 status"
pm2 list || true

echo "==> Port 8000"
ss -tlnp 2>/dev/null | grep ':8000' || echo "nothing listening on 8000"

echo "==> .env configuration check"
check_var() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" .env 2>/dev/null | cut -d= -f2- || true)"
  if [[ -z "${val}" ]]; then
    echo "  ${key}=MISSING"
  elif echo "${val}" | grep -qi 'replace'; then
    echo "  ${key}=PLACEHOLDER (needs real value)"
  else
    echo "  ${key}=set (${#val} chars)"
  fi
}

for key in MONGO_URL DB_NAME JWT_SECRET CORS_ORIGINS COOKIE_SECURE COOKIE_SAMESITE \
  S3_BUCKET S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY ADMIN_PHONE ADMIN_PASSWORD; do
  check_var "${key}"
done

echo "==> PM2 logs (last 30 lines)"
pm2 logs chatflow-backend --lines 30 --nostream 2>&1 || true
