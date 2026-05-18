/**
 * PM2 process config for ChatFlow FastAPI on OCI.
 * Usage (on server): cd /home/ubuntu/chatflow/backend && pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "chatflow-backend",
      cwd: "/home/ubuntu/chatflow/backend",
      script: ".venv/bin/python3",
      args: "-m uvicorn server:app --host 127.0.0.1 --port 8000",
      env: {
        CORS_ORIGINS:
          "https://140-245-209-196.sslip.io,http://localhost,capacitor://localhost,ionic://localhost",
      },
    },
  ],
};
