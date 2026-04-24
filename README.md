# 💬 ChatFlow — Complete Install & Run Guide

A real-time chat app with Admin / Employee / Client roles, groups, media uploads, profile/status, and admin monitoring.

**Built by: vijay_anuganti · © 2026**

---

## ✅ What you'll install (exact versions that are proven to work)

| Software      | Recommended version | Minimum | Download                                                     |
| ------------- | ------------------- | ------- | ------------------------------------------------------------ |
| **Python**    | 3.11.x              | 3.10    | <https://www.python.org/downloads/release/python-3118/>      |
| **Node.js**   | 20.11.x LTS         | 18.x    | <https://nodejs.org/en/download/>                            |
| **Yarn**      | 1.22.22             | 1.22.x  | After Node: `npm install -g yarn@1.22.22`                    |
| **MongoDB**   | 7.0.x Community     | 6.0     | <https://www.mongodb.com/try/download/community>             |
| **Git**       | 2.40+               | any     | <https://git-scm.com/downloads>                              |

> ✅ Tested end-to-end on **Python 3.11.8, Node 20.11.1, Yarn 1.22.22, MongoDB 7.0.5** on macOS / Ubuntu 22.04 / Windows 11.

---

## 📦 Exact Python packages (already pinned in `backend/requirements.txt`)

```
fastapi==0.110.1
uvicorn==0.25.0
motor==3.3.1
pymongo==4.5.0
pydantic>=2.6.4
email-validator>=2.2.0
python-dotenv>=1.0.1
pyjwt>=2.10.1
bcrypt==4.1.3
python-multipart>=0.0.9
```

## 📦 Exact Node packages (already in `frontend/package.json`)

Main ones:
```
react                 19.0.0
react-dom             19.0.0
react-router-dom       7.5.1
axios                  1.8.4
tailwindcss            3.4.17
lucide-react           0.507.0
sonner                 2.0.3
```

---

## 🪟 / 🍎 / 🐧 Step-by-step

### 0 · Install MongoDB and start it

**macOS (Homebrew)**
```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Ubuntu 22.04**
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Windows 10/11**
- Download the `.msi` from the MongoDB link above.
- During install choose **"Complete"** and check **"Install MongoDB as a Service"**.
- MongoDB will auto-start on localhost:27017.

Verify: `mongosh --eval "db.runCommand({ ping: 1 })"` should print `{ ok: 1 }`.

---

### 1 · Get the project

You have **two options**:

#### Option A — Use the ZIP bundle

1. In Emergent, open the code editor view.
2. Download `/app/chatflow.zip` (right-click → Download).
3. Unzip it wherever you want, e.g. `~/chatflow`.

#### Option B — Save to GitHub (recommended)

1. In the Emergent chat toolbar, click **"Save to GitHub"** (top area of the UI).
2. On your laptop:
   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git chatflow
   cd chatflow
   ```

---

### 2 · Backend setup (FastAPI + MongoDB)

```bash
cd chatflow/backend

# Create a virtual environment
python -m venv .venv

# Activate it
# macOS / Linux:
source .venv/bin/activate
# Windows (PowerShell):
# .venv\Scripts\Activate.ps1

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Create `backend/.env`** (copy exactly — replace JWT_SECRET with a long random value):

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="chatflow_db"
CORS_ORIGINS="http://localhost:3000"
JWT_SECRET="replace-this-with-a-64-char-random-hex"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

Generate a secure `JWT_SECRET`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Run the backend**:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

You should see logs like:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
INFO: Seeded admin user: admin
```

The backend auto-seeds these accounts on first boot:
| Username   | Password      | Role     |
| ---------- | ------------- | -------- |
| admin      | admin123      | admin    |
| employee1  | employee123   | employee |
| client1    | client123     | client   |

---

### 3 · Frontend setup (React)

Open a **new terminal** (leave the backend running in the other).

```bash
cd chatflow/frontend
yarn install
```

**Create `frontend/.env`**:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
ENABLE_HEALTH_CHECK=false
```

**Run the frontend**:
```bash
yarn start
```

Browser should open <http://localhost:3000> automatically.

---

### 4 · Try it 🎉

1. Log in as **admin / admin123** → you land on the Admin dashboard.
2. Open an incognito window → sign in as **employee1 / employee123**.
3. Open another incognito window → **client1 / client123**.
4. From employee window, click **"+ New chat"** → pick the client → start chatting. You'll see typing + messages in real-time.
5. Try **Group tab** in the new-chat dialog → name it "Team", add everyone → send a message. All windows update instantly.
6. Upload an image or PDF via the 📎 paperclip icon.
7. In the admin window:
   - **Monitor Chats** → read-only feed of every conversation (left/right bubbles with sender names + live typing).
   - **My Chats** → admin joins the conversation and messages anyone.
   - **Activity** → click any user to see their conversations and message count.
   - **Users** → full table with online status; per-row "Chat" button.
8. Click the ⚙️ settings icon in the sidebar to change **bio, status, profile photo, or password**.
9. Test **Forgot password** on the login page: the OTP is shown right in the page (dev mode).

---

## 🩹 Troubleshooting

| Problem                                       | Fix                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `pymongo.errors.ServerSelectionTimeoutError` | MongoDB isn't running. See Step 0.                                     |
| Frontend shows "Network error"                | Check `REACT_APP_BACKEND_URL` matches where uvicorn is listening.      |
| `EADDRINUSE 3000` / `8001`                    | Kill previous process: `lsof -i:3000 -t \| xargs kill -9`               |
| Upload fails                                  | Make sure `backend/uploads/` is writable.                              |
| CORS errors                                   | Update `CORS_ORIGINS` in `backend/.env` to your frontend URL.          |
| OTP lost                                      | Look in the backend terminal — it's also logged as `[DEV OTP] ...`.    |

---

## 🚢 Going to production (optional)

- Change `JWT_SECRET` to a real random secret.
- Lock down `CORS_ORIGINS` to your real domain.
- Wire `/api/auth/forgot-password` to a real email provider (Resend/SendGrid/SES). Replace the dev-mode response.
- Move `/app/backend/uploads` to object storage (S3, Cloudflare R2, Supabase Storage).
- Add rate limiting on `/auth/*` endpoints.
- Serve the React build (`yarn build`) from a CDN (Vercel, Netlify, Cloudflare Pages) and point it at your backend URL.

---

## 📚 Project layout

```
chatflow/
├── backend
│   ├── server.py                 # FastAPI + WebSocket + all routes
│   ├── requirements.txt
│   ├── .env                      # (you create this)
│   └── uploads/                  # user-uploaded files
└── frontend
    ├── package.json
    ├── .env                      # (you create this)
    └── src
        ├── App.js                # routes + auth guards
        ├── index.css             # Tailwind + theme + bubble styles
        ├── context/AuthContext.jsx
        ├── hooks/useChatSocket.js
        ├── lib/api.js
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── ForgotPassword.jsx
        │   ├── ChatApp.jsx
        │   └── AdminDashboard.jsx
        └── components/
            ├── ui/               # shadcn components (button, dialog, tabs, ...)
            ├── Avatar.jsx
            ├── MessageBubble.jsx
            ├── ChatSidebar.jsx
            ├── ChatWindow.jsx
            ├── NewChatDialog.jsx
            └── ProfileDialog.jsx
```

---

Built with ❤️ by **vijay_anuganti**. Ship happy chats! 🚀
