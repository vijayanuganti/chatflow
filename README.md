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
- Real-time messaging (WebSocket), uploads (S3), admin monitoring, batches, and diet plans.
- **Per-user chat preferences** — pin, archive, and mute conversations (WhatsApp-style long-press selection on mobile).
- **Contact profiles & shared media** — avatar quick view, full profile pages, and Media / Documents / Links tabs.
- **Client medical profiles** — conditions, medications, and notes; visible to assigned employees and admins.
- **Complaints** — clients raise issues against their employee; admins triage from the panel (open / solved).
- **Push notifications** — Firebase Cloud Messaging (FCM) on web (service worker) and Android (native tray + actions); muted chats skip FCM.
- **Foreground message banner** — in-app dropdown when a new message arrives while the app is open (positioned below the status bar on native).
- **Single-session login** — one active device per account; logging in elsewhere signs out the previous session and clears push tokens.
- **Shared folders** — admins/employees create folders with media, documents, and links; role-gated view/edit access.
- **WhatsApp-style chat media** — inline video thumbnails with a single custom play control; full-screen in-app photo/video viewers; documents open via native “Open with” (no in-app PDF viewer).
- **Video poster API** — server-generated thumbnails at `GET /api/media/thumbnail/{file_id}` with client-side frame capture fallback.
- **ChatFlow device folders (Android)** — downloaded chat media saved under `Download/ChatFlow/` (`frontend/src/utils/fileSystem.js`).
- **In-app Privacy Policy** — full-screen scrollable policy from **About** (all portals); no external browser.
- **i18n** — English, Hindi, and Telugu via `react-i18next` (language picker in the top-bar menu).
- **Client referrals** — employees and clients can refer new clients from the top-bar menu.
- **Role-aware mobile shells** — fixed ChatFlow header, panel footers (Chats · Diet · Settings for clients; Chats · Batches · Settings for employees), and native back-button handling.
- **Production on AWS EC2** — Nginx + PM2 + MongoDB Atlas + S3 + DuckDNS HTTPS (documented below); optional Render/Vercel path also supported.

---

## Chat & mobile UX

### Conversation list (`ChatSidebar`)

- **Pin / Archive / Mute** — stored per user in `conversation_preferences`; list responses include `is_pinned`, `is_archived`, `is_muted` and pinned chats sort first.
- **Long-press selection (mobile)** — long-press a row to enter selection mode:
  - The **search bar slot only** swaps to an emerald action bar: **←** clear, **“1 selected”**, and **Pin / Mute / Archive**.
  - The **ChatFlow top bar** and **bottom navigation** stay visible (unchanged shell).
  - Selected rows get a subtle emerald highlight.
  - **Haptic feedback** on long-press via `@capacitor/haptics` (`frontend/src/lib/selectionHaptics.js`).
- **Hardware / system back** — when a row is selected, back clears selection before closing a chat or leaving the list (`useDoubleBackToExit` in `ChatApp` / `AdminDashboard`).
- **Archived view** — toggle to browse archived chats; search applies within the active list.
- **List scroll preservation** — scroll position is saved/restored across navigation (`frontend/src/lib/chatListScroll.js`).
- No per-row ⋯ menus on the conversation list (actions are selection-only).

### Chat thread (`ChatWindow`)

- **Date dividers** — Today / Yesterday / `DD/MM/YYYY` (`frontend/src/lib/chatDateGroups.js`).
- **Scroll-to-bottom** floating button when scrolled up.
- **Typing indicator** — shows `typing...` only.
- **In-chat search** — find messages with highlighted matches.
- **Starred messages** — star/unstar stored in `localStorage` per conversation (`frontend/src/lib/starredMessages.js`).
- **Header tap** — opens the contact **User profile** page (mute toggle + shared media).

### Chat media (images, video, documents)

| Type | Inline bubble | Tap action |
| ---- | ------------- | ---------- |
| **Image** | Thumbnail in bubble | Full-screen `ChatImageViewer` (pinch-zoom, editor sidebar) |
| **Video** | Poster image + single center play icon; timestamp + ticks bottom-right (`ChatVideoBlock.jsx`) | Full-screen `ChatVideoViewer` (auto-play, tap to pause, bottom seek bar) |
| **Document** | File name + size row | Native “Open with” via `@capacitor-community/file-opener` (`openDocumentInNativeApp`) |
| **Audio** | WhatsApp-style voice row (`VoiceNotePlayer`) | In-bubble playback |

- **No duplicate play icons** — inline video bubbles use `<img>` posters only; native `<video>` controls are suppressed (`controls={false}` + WebKit CSS in `index.css`).
- **Poster pipeline** — local upload preview → API thumbnail → client frame capture (`useVideoPoster.js`, `videoThumbnailUrl.js`).
- **Downloads** — optional cache + progress ring for large files (`useChatMediaDownload.js`, `chatMediaCache.js`); videos with in-app playback skip download UI when `onOpenInAppMedia` is wired.

### About, legal & support

- **About sheet** — bottom sheet from the top-bar **⋮ → About** (`AboutSheet.jsx`); app version, features, credits from `frontend/src/lib/appInfo.js`.
- **Privacy Policy** — in-app full-screen page (`PrivacyPolicyScreen.jsx`); content in `privacyPolicyContent.js`; back returns to About.
- **Contact Support** — `mailto:` link using `SUPPORT_EMAIL` from `appInfo.js` (override with `REACT_APP_SUPPORT_EMAIL`).

### Profiles & shared media

- **Avatar tap** (list or thread) — `ProfileQuickView` sheet.
- **Full profile** — `/chat/contact/:userId` (client/employee) or `/admin/contact/:userId` (`UserProfilePage.jsx`) with mute control and `SharedMediaSection` (Media / Documents / Links).
- **Public user API** — `GET /api/users/{user_id}/public` for safe contact fields.

### Top bar & admin panel

- App title is always **ChatFlow** (not “Admin | Overview”, etc.).
- **Refresh** in the three-dots menu re-fetches conversations, messages, and cache (no logout).
- **Admin → Users** filter: All | Employees | Clients | Inactive Clients.
- **Unread badge** on the admin mobile footer **Chats** tab (not on the logo).
- **Mobile “More” hub** — Monitor chats, Batches, Accounts, Permissions, Activity (audit), Complaints, Storage, Inactive clients, Settings.
- **Complaints inbox** — filter all / open / solved; mark solved or reopen.
- **Storage** — admin view of upload usage; delete conversations or user accounts from the panel.
- **Medical profile** — edit client medical data from user detail (`/admin/users/...` flows).

### Mobile footers (`PanelBottomNav`)

| Role     | Tabs                          |
| -------- | ----------------------------- |
| Client   | Chats · My Diet · Settings    |
| Employee | Chats · Batches · Settings    |
| Admin    | Overview · Chats · Users · …  |

Footers hide only when a **conversation thread** is open, not during list selection.

### Client diet

- **My Diet** opens `DietPlanPage` from **Day 1** (`startFromDayOne` on `DietPlanContent`).
- Employees/admins manage multi-day plans, meal slots, photo uploads, and notes per client (`DietPlanContent.jsx`).

### Client complaints & medical

- **Raise a complaint** — clients use **Profile → Raise a complaint** (`RaiseComplaintPage.jsx`); stored with status `open` / `solved`.
- **Medical profile** — `MedicalProfilePage.jsx` for clients; employees/admins view via user account detail and admin user tools.

### Notifications

| Surface | Behavior |
| -------- | -------- |
| **Web (PWA)** | Service worker (`frontend/public/sw.js`) shows tray notifications from FCM data payloads when the tab is backgrounded. |
| **Android (native)** | FCM → `ChatFlowMessagingService` — grouped per sender, reply/mark-read actions, coalesced threads; not duplicated by the web SW. |
| **Foreground** | `InAppMessageBanner.jsx` — tap to open the conversation; swipe to dismiss; auto-hides after ~4.5s. |
| **Muted chats** | FCM is **skipped** when `conversation_preferences.is_muted` is true for that user. |
| **Active chat** | Tray + banner suppressed while viewing the same conversation (native prefs + `optimisticMessages.js`). |
| **Toasts** | Sonner toasts for errors/success; top offset uses `--app-safe-area-top` so banners sit below the OS status bar on Android (`safeAreaInsets.js`). |

Token registration: `POST /api/users/me/fcm-token` after login on native (`PushNotificationBootstrap.jsx`).

---

## Mobile app (Capacitor)

Native shells live under `frontend/android` and `frontend/ios` (Capacitor 8).

- **Install:** JavaScript dependencies (including `@capacitor/*`) install only under **`frontend/`**. From that directory run `npm install` before `npm start` or `npm run build`; otherwise Webpack reports “Can't resolve '@capacitor/…'”.
- **Build and sync:** from `frontend/`, run `npm run build:mobile` (CRA build + `npx cap copy` + `npx cap sync`). Debug APK: `npm run android:assemble`.
- **Open in IDEs:** `npm run cap:android` or `npm run cap:ios` (iOS requires macOS with Xcode).
- **App name and bundle id:** edit `frontend/capacitor.config.json` (`appName`, `appId`). Defaults: **ChatFlow** and **`com.chatflow.app`**. Change `appId` if you need something like `com.user.myapp`; after changing it, run `npx cap sync` and fix signing in Android Studio / Xcode.
- **Branded splash:** `SplashScreenBootstrap.jsx` shows ChatFlow icon + wordmark for at least 3s on native while auth loads; Capacitor splash is hidden as soon as React paints.
- **API URL resolution** (`frontend/src/lib/backendUrl.js`):
  - **Native:** `REACT_APP_BACKEND_URL_MOBILE` or `REACT_APP_BASE_URL` (must be a LAN IP or public HTTPS URL — never `localhost`).
  - **Browser on AWS (DuckDNS / EC2):** same origin as the page; REST calls go to `/api` via Nginx (no `:8000` in the URL).
  - **Browser dev:** same host as CRA, port `8001`.
- **Auth on native:** JWT in `Authorization` header + `X-ChatFlow-Browser-Id` (not HttpOnly cookies — avoids WebView CORS issues). `nativeAuthSync.js` mirrors the token into Android shared prefs for FCM handlers.
- **CORS for the native shell:** include `http://localhost`, `capacitor://localhost`, and `ionic://localhost` in backend `CORS_ORIGINS` for production APKs talking to a public API.
- **Push:** `@capacitor/push-notifications` registers FCM tokens; custom `ChatFlowNative` plugin tracks active chat and notification sounds on Android (`frontend/android/.../ChatFlowNativePlugin.java`).
- **Firebase:** place `firebase-adminsdk.json` in `backend/` for local dev, or set `FIREBASE_SERVICE_ACCOUNT_FILE` on the server (see `backend/.env.example`). Add `google-services.json` in the Android app per Firebase console instructions.
- **Camera and photos:** profile avatar and chat “Photo” attachments use `@capacitor/camera` (`nativeMedia.js`). iOS privacy strings are in `frontend/ios/App/App/Info.plist`.
- **Files:** `@capacitor-community/file-opener` + `@capacitor/filesystem` for opening documents in chat (`mediaHandler.js`, `fileSystem.js`). Typed download subfolders: Images, Videos, Documents, Audio under `ChatFlow/`.
- **Quick scripts (repo root):**
  - `.\scripts\build-android.ps1` — `npm run build:mobile`, sync Capacitor, open Android Studio.
  - `.\scripts\build-android.ps1 -AssembleDebug` — same + debug APK via Gradle.
  - `.\scripts\deploy-aws.ps1` — `git push`, SSH deploy to AWS EC2 (pull, pip, PM2, frontend build, Nginx reload). Use `-SkipGitPush` to deploy only what is already on the remote. (`deploy-oci.ps1` is deprecated and forwards here.)
- **Haptics:** `@capacitor/haptics` for chat-list long-press selection (`selectionHaptics.js`). After adding or upgrading native plugins, run `npm run cap:sync` from `frontend/`.
- **Safe area:** status-bar spacer in `TopBar` / `ChatWindow`; notification banners and toasts use `notification-viewport-top` + `initSafeAreaInsets()` so they clear the Android status bar when `env(safe-area-inset-top)` is `0`.
- **System back:** `useDoubleBackToExit.js` traps back at the app root and delegates drill-up (clear selection → close chat → admin sub-panels) before normal history.
- **Capacitor CLI** 8.x may warn that **Node 22+** is expected; upgrade Node if `npx cap` misbehaves.

---

## Authentication flow

```
┌──────────────┐         POST /api/auth/login        ┌────────────────┐
│  Login page  │  ─── { phone_number, password } ──► │  FastAPI       │
│ (phone + pw) │                                      │  /api          │
└──────────────┘  ◄── HttpOnly JWT cookie (7d) ──────└────────────────┘
```

- All other routes (chat, admin) re-validate the session via `/api/auth/verify`.
- **Web:** HttpOnly JWT cookie; axios sends `withCredentials`.
- **Native (Capacitor):** JWT in `Authorization: Bearer` + `X-ChatFlow-Browser-Id` header (no cookies).
- WebSocket upgrade uses the cookie or `?token=` query param.
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

### `conversation_preferences`
Per-user, per-conversation settings (not global for the thread).

| Field              | Type   | Notes                                      |
| ------------------ | ------ | ------------------------------------------ |
| `id`               | string | `{user_id}_{conversation_id}`              |
| `user_id`          | string | Viewer who owns this preference row.       |
| `conversation_id`  | string | Conversation UUID.                         |
| `is_pinned`        | bool   | Pinned chats appear first in the list.     |
| `is_archived`      | bool   | Hidden from main list; archived view only. |
| `is_muted`         | bool   | Suppresses FCM for that conversation.      |
| `updated_at`       | iso    | Last change.                               |

Index: `(user_id, conversation_id)` unique.

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

### Messaging & conversations
- `GET  /api/conversations` — each row may include `is_pinned`, `is_archived`, `is_muted` for the current user; pinned-first sort applied server-side.
- `PATCH /api/conversations/{conv_id}/preferences` — body `{ is_pinned?, is_archived?, is_muted? }` (partial update).
- `POST /api/conversations/start`, `POST /api/conversations/group`
- `GET  /api/conversations/{id}/messages`, `POST /api/conversations/{id}/read`
- `POST /api/messages`, `POST /api/upload`, `GET /api/files/{id}`
- `GET  /api/media/thumbnail/{file_id}` — JPEG poster for video files (auth via cookie or `?token=`).
- `WS   /api/ws?token=...`

### Public profiles
- `GET /api/users/{user_id}/public` — contact-safe profile fields for profile pages.
- `GET /api/users/{user_id}/medical-profile` — client medical profile (role-gated).
- `PUT /api/admin/users/{user_id}/medical-profile` — admin updates client medical data.

### Diet plans
- `GET  /api/clients/{client_id}/diet-plans` — list plans for a client.
- `POST /api/clients/{client_id}/diet-plans` — create a new day/plan.
- `PUT  /api/diet-plans/{plan_id}/suggestions` — meal text suggestions.
- `PUT  /api/diet-plans/{plan_id}/meal/{slot}/photo` — upload meal photo.
- `DELETE /api/diet-plans/{plan_id}/meal/{slot}/photo` — remove meal photo.

### Complaints
- `POST /api/complaints` — client raises a complaint.
- `GET  /api/complaints/me` — client’s own complaints.
- `GET  /api/admin/complaints` — admin inbox (`?status=open|solved`).
- `PATCH /api/admin/complaints/{complaint_id}` — update status / notes.

### Push & notification actions
- `POST /api/users/me/fcm-token` — register device FCM token.
- `POST /api/notifications/mark-read`, `/notifications/direct-reply`, `/notifications/update-status` — Android notification action callbacks.

---

## Suggested folder structure

```
chatflow/
├─ scripts/
│  ├─ build-android.ps1         ← mobile build + Capacitor sync + Android Studio
│  ├─ deploy-aws.ps1            ← git push + SSH deploy to AWS EC2
│  └─ deploy-aws.sh             ← same deploy (Git Bash / Linux / macOS)
├─ backend/
│  ├─ server.py                 ← routes, RBAC, audit, FCM, migrations
│  ├─ media_thumbnails.py       ← video poster generation for /api/media/thumbnail
│  ├─ ecosystem.config.cjs      ← PM2 config for AWS EC2
│  ├─ requirements.txt
│  ├─ .env(.example)
│  ├─ uploads/                  ← local dev fallback for files
│  └─ firebase-adminsdk.json    ← local dev only (gitignored in prod)
└─ frontend/
   ├─ capacitor.config.json
   ├─ android/                   ← Capacitor Android + ChatFlow FCM services
   ├─ ios/
   ├─ public/sw.js                ← web push service worker
   └─ src/
      ├─ App.js                      ← routes, Toaster, InAppMessageBanner, bootstraps
      ├─ context/AuthContext.jsx
      ├─ hooks/
      │  ├─ useDoubleBackToExit.js
      │  ├─ useChatSocket.js
      │  └─ useOptimisticMessageSend.js
      ├─ lib/
      │  ├─ api.js, backendUrl.js    ← JWT native auth; Nginx /api gateway
      │  ├─ push.js, notify.js, inAppNotifications.js
      │  ├─ notificationDisplay.js, safeAreaInsets.js
      │  ├─ nativeAuthSync.js, nativeMedia.js, mediaHandler.js
      │  ├─ forcedLogout.js, videoThumbnailUrl.js, privacyPolicyContent.js
      │  ├─ conversationPreferences.js, optimisticMessages.js, appInfo.js
      │  └─ appRoutes.js, chatListScroll.js, sharedMedia.js, …
      ├─ utils/fileSystem.js           ← ChatFlow download folders (Capacitor)
      ├─ pages/
      │  ├─ ChatApp.jsx, AdminDashboard.jsx, Login.jsx
      │  ├─ DietPlanPage.jsx, MedicalProfilePage.jsx, RaiseComplaintPage.jsx
      │  ├─ ProfileSettingsPage.jsx, UserProfilePage.jsx, …
      └─ components/
         ├─ ChatSidebar.jsx, ChatWindow.jsx, TopBar.jsx
         ├─ AboutSheet.jsx, PrivacyPolicyScreen.jsx, LanguageSheet.jsx
         ├─ InAppMessageBanner.jsx, PushNotificationBootstrap.jsx
         ├─ SplashScreenBootstrap.jsx, SharedMediaSection.jsx
         └─ layout/PanelBottomNav.jsx, diet/, chat/ (ChatVideoBlock, viewers/), …
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

# Optional — push notifications (local: place firebase-adminsdk.json in backend/)
# FIREBASE_SERVICE_ACCOUNT_FILE=
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

`frontend/.env` (see [`frontend/.env.example`](./frontend/.env.example)):

```env
REACT_APP_BACKEND_URL=http://localhost:8001
# Native APK dev on a phone (LAN IP, match uvicorn port):
REACT_APP_BACKEND_URL_MOBILE=http://192.168.1.13:8001
WDS_SOCKET_PORT=0
```

For a **production APK** against AWS, set both mobile and web URLs to your public HTTPS host (e.g. `https://vijay-chatflow.duckdns.org`) before `npm run build:mobile`.

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

## Production deployment

Stack in all setups: **MongoDB Atlas** + **AWS S3** for uploads. Primary production is **AWS EC2** (Nginx + PM2); **Render/Vercel** is also supported below.

### Option A — AWS EC2 (production)

Typical layout: Ubuntu EC2 (`3.108.152.171`), Nginx serves the CRA `build/` and proxies `/api` → `127.0.0.1:8000`, PM2 runs Uvicorn, Atlas + S3 + Firebase for push. Public HTTPS: **https://vijay-chatflow.duckdns.org**.

| Piece | Notes |
| ----- | ----- |
| **Repo on server** | `/home/ubuntu/chatflow` |
| **Backend** | `backend/.venv`, `uvicorn` on port `8000` (localhost only) |
| **PM2** | [`backend/ecosystem.config.cjs`](./backend/ecosystem.config.cjs) — `pm2 start ecosystem.config.cjs` |
| **Frontend** | `cd frontend && npm run build` → Nginx `root` points at `build/` |
| **HTTPS** | DuckDNS + Let's Encrypt (`scripts/configure-aws-domain.sh`) |
| **CORS** | Include `https://vijay-chatflow.duckdns.org`, `http://localhost`, `capacitor://localhost`, `ionic://localhost` |
| **Firebase** | `FIREBASE_SERVICE_ACCOUNT_FILE=/home/ubuntu/chatflow/backend/firebase-adminsdk.json` |
| **SSH key** | `chatflow-aws.pem` (e.g. `OneDrive\Documents\chatflow-aws.pem`) |

**One-command deploy from Windows (after `git push`):**

```powershell
.\scripts\deploy-aws.ps1
# Optional: -SshKey "C:\path\to\chatflow-aws.pem"  -SkipGitPush
```

This SSHs to `ubuntu@3.108.152.171`, runs `git pull`, reinstalls backend deps, `pm2 restart chatflow-backend`, `npm run build` in `frontend/`, and reloads Nginx.

**Manual update (SSH into EC2):**

```bash
cd /home/ubuntu/chatflow && git pull

# Backend
cd backend && source .venv/bin/activate && pip install -r requirements.txt && deactivate
pm2 restart chatflow-backend && pm2 save

# Frontend
cd ../frontend && npm install && npm run build
sudo nginx -t && sudo systemctl reload nginx
```

After `.env` changes: `pm2 restart chatflow-backend --update-env`.

**Live instance:** https://vijay-chatflow.duckdns.org

**Browser API URL:** on DuckDNS / EC2 hosts, the app uses same-origin `/api` automatically (`backendUrl.js`). No `:8000` in the public URL.

**Mobile release:** set `REACT_APP_BACKEND_URL` and `REACT_APP_BACKEND_URL_MOBILE` to `https://vijay-chatflow.duckdns.org`, then:

```powershell
.\scripts\build-android.ps1
```

Build a signed APK/AAB in Android Studio (**Build → Generate Signed Bundle / APK**). Add your host to `capacitor.config.json` → `server.allowNavigation` if needed.

**Other scripts:** `scripts/bootstrap-aws.sh` (first-time server setup), `scripts/start-aws-backend.sh` (sync `.env` + restart PM2), `scripts/configure-aws-domain.sh` (DuckDNS + SSL).

---

### Option B — Render / Vercel

End-to-end recipe: backend on **Render Web Service**, frontend on **Render
Static Site** (or Vercel).

#### 1. Backend — Render Web Service

| Setting              | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Environment          | `Python 3`                                                |
| Root Directory       | `backend`                                                 |
| Build Command        | `pip install -r requirements.txt`                         |
| Start Command        | `uvicorn server:app --host 0.0.0.0 --port $PORT`          |
| Health Check Path    | `/api/auth/verify` (returns 401 unauth — that's expected) |
| Instance Type        | `Starter` is enough to begin with                         |

Then in **Environment → Add Environment Variable**, paste the values from
[`backend/.env.example`](./backend/.env.example) one row at a time (or use the
"Add from .env" bulk editor). At minimum you must set:

- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET` (generate with `openssl rand -hex 48`)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_PHONE`
- `CORS_ORIGINS` = comma-separated, **no spaces** after commas. Include your **web** origin and the **native shell** origins the app uses (Capacitor’s WebView still reports these even when the API is on the public internet), for example:  
  `https://chatflow.vercel.app,http://localhost,capacitor://localhost,ionic://localhost`
- `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`  (cross-site cookie over HTTPS)
- `S3_BUCKET`, `S3_REGION`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`

> **Cookies gotcha.** Render gives the backend `*.onrender.com`. If your
> frontend lives on a *different* domain (Vercel, Render Static Site, your own
> domain) the browser treats the session cookie as cross-site, so you **must**
> use `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none`. With those settings the
> cookie only works over HTTPS (which Render gives you for free).

#### 2. Frontend — Render Static Site (or Vercel)

| Setting           | Value                                |
| ----------------- | ------------------------------------ |
| Root Directory    | `frontend`                           |
| Build Command     | `yarn install && yarn build`         |
| Publish Directory | `build`                              |

Build-time environment variables (from [`frontend/.env.example`](./frontend/.env.example)):

- `REACT_APP_BACKEND_URL` = your Render backend URL, e.g. `https://chatflow-api.onrender.com`

#### 3. Capacitor — installable app on other phones

The JS bundle bakes API URLs at **build time**. Other people’s phones do **not** use your LAN IP; they must talk to the same **public HTTPS** API as production web.

1. **Environment (before `npm run build:mobile`)**  
   - Set `REACT_APP_BACKEND_URL=https://your-api.onrender.com` (no trailing slash).  
   - Set `REACT_APP_BACKEND_URL_MOBILE` to the **same** HTTPS URL (or leave it empty so the native app falls back to `REACT_APP_BACKEND_URL`).  
   Do **not** ship a release build that still points at `http://192.168.x.x`.

2. **Backend `CORS_ORIGINS`** must include the native origins listed above (`http://localhost`, `capacitor://localhost`, `ionic://localhost`) **in addition to** your hosted web app URL, or the app will fail API calls from the installed APK/IPA.

3. **Build and ship**  
   - From `frontend/`: `npm run build:mobile`, then open Android Studio / Xcode, bump version code, and build a **release** APK or AAB (Android) or archive for TestFlight / App Store (iOS).  
   - For sideloading Android, recipients install the signed APK (or you use Play Console **Internal testing**).

4. **Optional:** In [`frontend/capacitor.config.json`](./frontend/capacitor.config.json), extend `server.allowNavigation` with your API **hostname** if you open that host inside the WebView. XHR/fetch to the API does not require this.

5. **S3 / uploads:** Production uploads go to S3; ensure `S3_PUBLIC_BASE_URL` is correct and bucket policy/CORS allow your web origin if the browser loads objects directly.

After the first deploy:

1. Visit the frontend, sign in with `ADMIN_PHONE` + `ADMIN_PASSWORD` from your env.
2. Open **Profile → Change password** and set a strong password.
3. Use the admin panel to create real employee / client accounts.
