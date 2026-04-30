# ChatFlow

Real‑time chat app with **Admin / Employee / Client** roles, modern responsive UI, unread counts, media uploads, and admin monitoring.

## Features

- **Roles**: Admin / Employee / Client
- **Realtime**: WebSocket messages + typing + presence
- **Uploads**: images / videos / files (S3 in production)
- **Admin**: monitor all conversations, activity view, user management
- **Mobile-first**: responsive layout + mobile navigation

---

## Local development

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

Create `backend/.env` (example):

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="chatflow_db"
JWT_SECRET="replace-with-a-strong-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
CORS_ORIGINS="http://localhost:3000"

# SMTP (optional for email OTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="starttls"
SMTP_USER="your@gmail.com"
SMTP_PASS="your_app_password"
SMTP_FROM="ChatFlow <your@gmail.com>"

# S3 (optional for local; required for production)
S3_BUCKET="your-bucket"
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
S3_PUBLIC_BASE_URL="https://your-bucket.s3.ap-south-1.amazonaws.com"
```

Tip: you can copy `backend/.env.example` → `backend/.env` and fill values.

### Frontend (React / CRA)

```bash
cd frontend
yarn install
yarn start
```

Create `frontend/.env` (example):

```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
```

Tip: you can copy `frontend/.env.example` → `frontend/.env` and fill values.

---

## Production deployment (Vercel + Render + Atlas + S3)

This is the recommended production setup:

- **Frontend**: Vercel
- **Backend**: Render (FastAPI Web Service)
- **Database**: MongoDB Atlas
- **Uploads**: AWS S3

### Step 0 — Prep accounts

- Create MongoDB Atlas cluster and get your connection string.
- Create AWS S3 bucket + IAM user with access keys.
- Push this repo to GitHub (Render & Vercel both deploy from Git).

---

### Step 1 — Configure S3

#### IAM permissions (minimum)
Attach a policy allowing the backend to put objects (and optionally read/list):

- Bucket: `your-bucket`
- Prefix: `uploads/`

Recommended permissions:
- `s3:PutObject`
- `s3:PutObjectAcl` (only if you use ACLs)
- `s3:GetObject` (only if you need backend reads)

#### Public access
This app returns a public URL for uploaded files. So:
- Make uploaded objects publicly readable **or**
- Use CloudFront/public bucket policy.

If you keep the bucket private, you’ll need signed URLs.

---

### Step 2 — Deploy backend to Render

1. In Render: **New → Web Service**
2. Connect GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**:

     ```bash
     pip install -r requirements.txt
     ```

   - **Start Command**:

     ```bash
     uvicorn server:app --host 0.0.0.0 --port $PORT
     ```

4. Add Render **Environment Variables**:

**Core**
- `MONGO_URL` = Atlas URI
- `DB_NAME` = `chatflow_db`
- `JWT_SECRET` = long random secret
- `ADMIN_USERNAME` = `admin`
- `ADMIN_PASSWORD` = strong password

**CORS**
- `CORS_ORIGINS` = your Vercel URLs, comma-separated:
  - Example:

    ```txt
    https://yourapp.vercel.app,https://yourapp-git-main-yourname.vercel.app
    ```

**SMTP (if you want email OTP)**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

**S3**
- `S3_BUCKET`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` (optional but recommended)

5. Deploy. Copy your backend URL:
   - Example: `https://chatflow-api.onrender.com`

---

### Step 3 — Deploy frontend to Vercel

1. In Vercel: **New Project**
2. Import GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Framework**: Create React App (or “Other”)
4. Add Vercel **Environment Variable**:

- `REACT_APP_BACKEND_URL` = your Render backend URL
  - Example: `https://chatflow-api.onrender.com`

5. Deploy. Open the Vercel URL.

---

### Step 4 — Validate end-to-end

- Login
- Start chat
- Upload a file → ensure the returned link opens from S3
- Check WebSocket live updates (typing/presence/unread badges)
- Check admin monitoring screens

---

## Troubleshooting (prod)

- **CORS errors**: ensure `CORS_ORIGINS` contains your exact Vercel domain(s).
- **WebSocket not connecting**: verify `REACT_APP_BACKEND_URL` is HTTPS (Vercel) so WS becomes WSS.
- **Uploads not working**:
  - check Render env vars `S3_BUCKET`, `AWS_REGION`, keys
  - confirm bucket policy/public access or CloudFront URL
- **Email OTP not delivered**: Gmail requires App Passwords + 2FA. Check Render logs for SMTP errors.

---

## Security notes

- Do **not** commit `.env` files.
- Rotate any SMTP/S3 keys if they were ever exposed.
- Use a strong `JWT_SECRET` in production."# chat-flow" 
