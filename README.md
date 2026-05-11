# ChatFlow

Real-time chat app with strict **Admin / Employee / Client** role-based access control.
Accounts are provisioned by administrators only — no self sign-up, no public password
reset, phone-number-based authentication, full audit trail of sensitive actions.

---

## Highlights

- **No public registration.** Admins (and delegated employees) create accounts.
- **Phone-based login** (`+91…`). Phone numbers are unique per user.
- **Delegated account creation** — admins may grant individual employees temporary
  or permanent permission to create client accounts.
- **Admin-only password resets** — no “Forgot password” for employees or clients.
- **Audit logs** — sign-ins, account creation, password resets and permission
  changes are persisted with actor, target and timestamp.
- **Show/hide password** toggles on every password field.
- Real-time messaging (WebSocket), uploads (S3), admin monitoring, batches.

---

## Authentication flow

```
┌──────────────┐         POST /api/auth/login        ┌────────────────┐
│  Login page  │  ─── { phone_number, password } ──► │  FastAPI       │
│ (phone + pw) │                                      │  /api          │
└──────────────┘  ◄── HttpOnly JWT cookie (7d) ──────└────────────────┘
```

- All other routes (chat, admin) re-validate the cookie via `/api/auth/verify`.
- WebSocket upgrade uses the same cookie (or `?token=` for mobile).
- There are **no** `/auth/register`, `/auth/forgot-password` or email-OTP endpoints.

---

## Role-based access control (RBAC)

| Capability                          | Admin | Employee (with permission) | Employee | Client |
| ----------------------------------- | :---: | :------------------------: | :------: | :----: |
| Sign in                             |  ✅   |             ✅             |    ✅    |   ✅   |
| Change own password                 |  ✅   |             ✅             |    ✅    |   ✅   |
| Create **employee** accounts        |  ✅   |             ❌             |    ❌    |   ❌   |
| Create **client** accounts          |  ✅   |             ✅             |    ❌    |   ❌   |
| Reset another user’s password       |  ✅   |             ❌             |    ❌    |   ❌   |
| Grant/revoke account-creation perm. |  ✅   |             ❌             |    ❌    |   ❌   |
| View audit logs                     |  ✅   |             ❌             |    ❌    |   ❌   |
| Monitor all conversations           |  ✅   |             ❌             |    ❌    |   ❌   |

Enforcement lives in FastAPI dependencies:

- `require_admin` — blocks non-admin requests.
- `require_account_creator` — admin OR an employee with `account_creation_access`.

---

## Database schema

### `users`
| Field                       | Type         | Notes                                                  |
| --------------------------- | ------------ | ------------------------------------------------------ |
| `id`                        | string (uuid)| Primary key.                                           |
| `username`                  | string       | Unique, lowercase. Auto-generated if not provided.     |
| `phone_number`              | string (E.164) | **Unique**, required. Used for login.                |
| `full_name`                 | string       | Display name.                                          |
| `password_hash`             | string       | bcrypt.                                                |
| `role`                      | string       | `admin` \| `employee` \| `client`.                     |
| `account_creation_access`   | bool         | When `true`, an employee can create client accounts.   |
| `created_by`                | string\|null | `users.id` of the actor that created this account.     |
| `password_reset_by`         | string\|null | `users.id` of the last admin to reset this password.   |
| `password_reset_at`         | iso datetime | Last admin password reset.                             |
| `permissions_updated_by`    | string\|null | Last admin to toggle this user’s permissions.          |
| `permissions_updated_at`    | iso datetime | When permissions were last changed.                    |
| `employee_id` (clients)     | string       | Owning employee.                                       |
| `batch_id` (clients)        | string       | Batch the client belongs to.                           |
| `bio`, `avatar_url`, `status`, `online`, `last_seen`, `created_at` | …  | Existing chat profile fields. |

Indexes: `username` (unique), `phone_number` (unique).

### `audit_logs`
| Field            | Type         |
| ---------------- | ------------ |
| `id`             | string (uuid)|
| `actor_user_id`  | string\|null |
| `action`         | string (namespaced: `account.create`, `password.admin_reset`, `permissions.account_creation.grant`, `permissions.account_creation.revoke`, `auth.login`, `auth.login_failed`, `auth.logout`, `password.self_change`) |
| `target_user_id` | string\|null |
| `metadata`       | object       |
| `timestamp`      | iso datetime |

Indexes: `timestamp DESC`, `actor_user_id`, `target_user_id`, `action`.

### Migrations
On startup `_migrate_user_documents` runs:

1. **Drops the legacy unique `email` index** if present.
2. **Backfills `phone_number`** on legacy documents using a deterministic
   `+91XXXXXXXXXX` placeholder; admins should reset these afterwards via the
   admin panel.
3. Ensures `account_creation_access`, `created_by`, `password_reset_by` exist.

---

## REST API surface

### Auth
- `POST /api/auth/login` — `{ phone_number, password }` → sets HttpOnly cookie.
- `POST /api/auth/logout` — clears cookie.
- `GET  /api/auth/verify` — returns the current session’s user.
- `GET  /api/auth/me` — same shape, semantic alias.

### Self
- `PUT  /api/users/me` — update `full_name`, `bio`, `status`, `avatar_url`.
- `POST /api/users/me/password` — change own password (requires current password).
- `GET  /api/me/permissions` — `{ role, account_creation_access }`.

### Account creation (admin OR permitted employee)
- `POST /api/accounts` — body `{ phone_number, password, full_name, role, username?, employee_id?, batch_id? }`.
  - Admin may create `employee` or `client`.
  - Permitted employee may create `client` only (auto-assigned to themselves).

### Admin only
- `GET  /api/admin/users`
- `GET  /api/admin/users/{id}` — includes `created_by_user` and `password_reset_by_user`.
- `POST /api/admin/users/{id}/reset-password` — `{ new_password }`.
- `POST /api/admin/users/{id}/permissions` — `{ account_creation_access: bool }`.
- `GET  /api/admin/audit-logs?action=...&limit=...`
- `GET  /api/admin/stats`, `/admin/conversations`, `/admin/employees`, `/admin/batches`, `/admin/employees/{id}/batches`, `/admin/users/{id}/activity`.

### Messaging (unchanged)
- `GET  /api/conversations`, `POST /api/conversations/start`, `POST /api/conversations/group`
- `GET  /api/conversations/{id}/messages`, `POST /api/conversations/{id}/read`
- `POST /api/messages`, `POST /api/upload`, `GET /api/files/{id}`
- `WS   /api/ws?token=...`

---

## Suggested folder structure

```
chatflow/
├─ backend/
│  ├─ server.py                 ← all routes, models, RBAC, audit, migrations
│  ├─ requirements.txt
│  ├─ .env(.example)
│  └─ uploads/                  ← local dev fallback for files
└─ frontend/
   └─ src/
      ├─ App.js                 ← /login, /chat, /admin/:section
      ├─ context/
      │  └─ AuthContext.jsx     ← session + role propagation
      ├─ lib/api.js             ← axios instance + helpers
      ├─ pages/
      │  ├─ Login.jsx           ← phone + password (show/hide), no registration
      │  ├─ ChatApp.jsx         ← client / employee chat
      │  └─ AdminDashboard.jsx  ← overview / accounts / permissions / audit / batches / monitor / users
      └─ components/
         ├─ PasswordInput.jsx       ← eye-icon show/hide
         ├─ CreateAccountDialog.jsx ← shared by admin & permitted employees
         ├─ ResetPasswordDialog.jsx ← admin-only password reset
         ├─ TopBar.jsx              ← create-account entry point for permitted users
         └─ ProfileDialog.jsx       ← self-service: name/status/avatar/password
```

---

## Local development

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

Create `backend/.env` from `backend/.env.example`. Important variables:

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="chatflow_db"
JWT_SECRET="replace-with-a-strong-secret"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
ADMIN_PHONE="+910000000001"

MIN_PASSWORD_LENGTH=6
DEFAULT_PHONE_COUNTRY=IN

CORS_ORIGINS="http://localhost:3000"
COOKIE_SECURE=false
COOKIE_SAMESITE=strict
```

On first boot the server seeds:

| Username    | Phone           | Password      | Role     |
| ----------- | --------------- | ------------- | -------- |
| `admin`     | `+910000000001` | `admin123`    | admin    |
| `employee1` | `+910000000011` | `employee123` | employee |
| `client1`   | `+910000000021` | `client123`   | client   |

Sign in with the **phone number** (not the username) on the login page.

### Frontend (React / CRA)

```bash
cd frontend
yarn install
yarn start
```

`frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
```

---

## Security

- Passwords hashed with bcrypt (cost 12).
- Sessions are HttpOnly cookies (set `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none`
  when frontend and backend live on different domains over HTTPS).
- Phone numbers validated with Google libphonenumber (E.164).
- All sensitive endpoints sit behind `require_admin` or `require_account_creator`.
- Role escalation is prevented:
  - `/accounts` creation defaults `account_creation_access=false`.
  - Employees may only create `client` accounts, only attached to themselves.
  - Admins cannot reset another admin’s password via `/admin/users/{id}/reset-password`.
- Audit logging is best-effort and never blocks the request path, but failures
  are warned in server logs.
- There is **no** public registration or password-reset surface to attack.

---

## Production deployment (Vercel + Render + Atlas + S3)

- Frontend: Vercel (`REACT_APP_BACKEND_URL=https://your-api.example.com`).
- Backend: Render (Web Service, build `pip install -r requirements.txt`, start
  `uvicorn server:app --host 0.0.0.0 --port $PORT`).
- DB: MongoDB Atlas (set `MONGO_URL`).
- Uploads: AWS S3 (`S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, optional `S3_PUBLIC_BASE_URL`).
- Cookies: set `COOKIE_SECURE=true`. Use `COOKIE_SAMESITE=none` when frontend
  and backend are on different sites.
- Set `CORS_ORIGINS` to a comma-separated list of your Vercel domains.

After first deploy: sign in as `admin` / `admin123` (via the admin phone),
**reset the admin password** immediately, then create real accounts via the
admin panel.
