#!/usr/bin/env bash
# Configure DuckDNS domain + Let's Encrypt SSL on AWS EC2.
set -euo pipefail

DOMAIN="vijay-chatflow.duckdns.org"
EMAIL="vijjuanuganti01@gmail.com"
HTTPS_ORIGIN="https://${DOMAIN}"

echo "==> [1/6] Update Nginx server_name to ${DOMAIN}"
# Active site (serves traffic)
sudo sed -i "s/server_name .*/server_name ${DOMAIN};/" /etc/nginx/sites-available/chatflow
# Also update default as requested
sudo sed -i "s/server_name .*/server_name ${DOMAIN};/" /etc/nginx/sites-available/default

echo "==> [2/6] Test and reload Nginx (HTTP)"
sudo nginx -t
sudo systemctl reload nginx

echo "==> [3/6] Install Certbot"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx

echo "==> [4/6] Obtain and install SSL certificate"
sudo certbot --nginx \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect

echo "==> [5/6] Update backend .env for HTTPS domain"
ENV_FILE="/home/ubuntu/chatflow/backend/.env"
cd /home/ubuntu/chatflow/backend

# CORS + cookies for HTTPS same-origin via Nginx
if grep -q '^CORS_ORIGINS=' "${ENV_FILE}"; then
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${HTTPS_ORIGIN},http://localhost,capacitor://localhost,ionic://localhost|" "${ENV_FILE}"
else
  echo "CORS_ORIGINS=${HTTPS_ORIGIN},http://localhost,capacitor://localhost,ionic://localhost" >> "${ENV_FILE}"
fi

if grep -q '^COOKIE_SECURE=' "${ENV_FILE}"; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "${ENV_FILE}"
else
  echo 'COOKIE_SECURE=true' >> "${ENV_FILE}"
fi

if grep -q '^COOKIE_SAMESITE=' "${ENV_FILE}"; then
  sed -i 's/^COOKIE_SAMESITE=.*/COOKIE_SAMESITE=lax/' "${ENV_FILE}"
else
  echo 'COOKIE_SAMESITE=lax' >> "${ENV_FILE}"
fi

if grep -q '^BACKEND_URL=' "${ENV_FILE}"; then
  sed -i "s|^BACKEND_URL=.*|BACKEND_URL=${HTTPS_ORIGIN}|" "${ENV_FILE}"
else
  echo "BACKEND_URL=${HTTPS_ORIGIN}" >> "${ENV_FILE}"
fi

if grep -q '^PUBLIC_URL=' "${ENV_FILE}"; then
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=${HTTPS_ORIGIN}|" "${ENV_FILE}"
else
  echo "PUBLIC_URL=${HTTPS_ORIGIN}" >> "${ENV_FILE}"
fi

# PM2 ecosystem CORS override must match
sed -i "s|CORS_ORIGINS:.*|CORS_ORIGINS: \"${HTTPS_ORIGIN},http://localhost,capacitor://localhost,ionic://localhost\",|" ecosystem.config.cjs

echo "    .env domain settings:"
grep -E '^(CORS_ORIGINS|COOKIE_SECURE|COOKIE_SAMESITE|BACKEND_URL|PUBLIC_URL)=' "${ENV_FILE}" | sed 's/=.*/=***/'

echo "==> [6/6] Restart PM2 and Nginx"
pm2 restart chatflow-backend --update-env
pm2 save
sudo nginx -t
sudo systemctl restart nginx

sleep 2
echo "==> Verification"
pm2 list
ss -tlnp | grep ':8000' || echo "WARN: port 8000 not listening"
curl -sI "https://${DOMAIN}/" | head -5
curl -s -o /dev/null -w "GET https://${DOMAIN}/api/auth/verify -> HTTP %{http_code}\n" "https://${DOMAIN}/api/auth/verify"

echo "==> Done: ${HTTPS_ORIGIN}"
