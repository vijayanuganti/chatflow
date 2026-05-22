# ChatFlow Manual Test Checklist

Use this document after automated tests (`TEST_REPORT.md`). Test on **production/staging** API with real accounts for **Admin**, **Employee**, and **Client**.

**Suggested devices:** Android APK (Capacitor) + Chrome desktop (admin panel).

Record each item: **Pass** / **Fail** / **N/A** and notes.

---

## 0. Test accounts & setup

- [ ] Admin credentials available
- [ ] Employee (active) credentials available
- [ ] Client (active, assigned to employee) credentials available
- [ ] Second phone/emulator for single-session tests
- [ ] API base URL matches build (`frontend/.env` → production host)

---

## 1. Authentication

### 1.1 Valid login (each portal)

1. Open app → `/login`
2. Log in as **Admin** → lands on `/admin`
3. Log out → repeat for **Employee** → `/chat`
4. Log out → repeat for **Client** → `/chat` (direct thread, no list if configured)

- [ ] Admin login success
- [ ] Employee login success
- [ ] Client login success

### 1.2 Invalid login

1. Enter wrong password for known username
2. Enter nonsense username

- [ ] Error toast/message shown
- [ ] No token stored (refresh app → still on login)

### 1.3 Single session & force logout

1. Log in as same user on **Device A**
2. Log in as same user on **Device B**
3. On Device A: send a message or wait &lt; 5s

- [ ] Device A force-logged out within ~1 second
- [ ] Modal/message mentions another device
- [ ] Back button cannot access chat after logout
- [ ] Device B remains logged in

### 1.4 Token expiry

1. Revoke session from admin or wait for JWT expiry (if test env allows)
2. Perform any API action

- [ ] Redirect to login with clear message

### 1.5 Logout cleanup

1. Log in, receive or trigger a notification badge
2. Log out from profile/menu
3. Check notification tray / in-app list

- [ ] No stale notifications after logout
- [ ] Re-login works cleanly

---

## 2. Navigation

### 2.1 Admin tabs

1. Log in as admin
2. Tap each footer tab: Overview, Users, Batches, Chat, Folders, Reports, Referrals, Complaints, Storage, More

- [ ] Each tab loads without error
- [ ] Active tab highlight correct

### 2.2 Employee / Client tabs

1. Open Chat, Folders (if shown), Profile/Diet as applicable

- [ ] Tabs switch correctly
- [ ] Client has no admin-only routes

### 2.3 Back navigation

**Users flow**

1. Admin → Users → open employee → open batch → **Back** → employee details → **Back** → users list

- [ ] Stack returns to correct screen each time

**Chat mobile**

1. Open conversation → **Back** → list (employee/admin)

- [ ] Correct parent screen

### 2.4 Deep links

1. With app in background, tap push notification for a message

- [ ] Opens correct conversation
- [ ] No crash if conversation deleted

### 2.5 Android hardware back

1. Navigate 3 levels deep → press system Back repeatedly

- [ ] Exits app only from root; no blank screens

---

## 3. Users module (Admin)

### 3.1 Search

1. Users tab → search by **name**, **user ID**, **phone**, **email** (partial match)

- [ ] Each query filters list correctly
- [ ] Empty search shows full tab set

### 3.2 Tab filters

1. Switch tabs: All, Active/Inactive Employees, Active/Inactive/Dropped Clients

- [ ] Counts and cards match tab rules

### 3.3 Activate / deactivate employee

1. Pick inactive employee → Activate
2. Pick active employee → Deactivate

- [ ] Status updates in list and detail
- [ ] Deactivated employee cannot log in (verify on device)

### 3.4 Drop client

1. Open client → Drop client (confirm dialog)

- [ ] `client_status` = dropped
- [ ] Appears under Dropped Clients tab

### 3.5 Employee details & batches

1. Open employee → verify profile sections load
2. Switch batch tabs: Active / Inactive / Dropped
3. Open a batch → client list loads

- [ ] Details page complete
- [ ] Batch tabs filter correctly
- [ ] Back navigation (section 2.3)

---

## 4. Chat

### 4.1 Client ACL

1. Log in as **Client**
2. Open chat — note counterpart

- [ ] Only **assigned employee** (no admin, no other clients)
- [ ] No “new chat” list if product skips list screen

### 4.2 Employee / Admin chat

1. Employee: see assigned clients + permitted conversations
2. Admin: can open user chats from admin chat tab

- [ ] Lists match role rules

### 4.3 Message actions

1. Long-press **own text** message → ⋮ → **Edit** → change text → save

- [ ] “Edited” label appears
- [ ] Cancel edit discards changes

2. Long-press **other user’s text** → ⋮

- [ ] **Edit** not offered (or disabled)

3. Long-press any message → **Star** → open **Starred messages**

- [ ] Star icon on bubble
- [ ] Starred list shows message
- [ ] Tap row scrolls to message in thread

4. Starred → **Unstar**

- [ ] Removed from starred list

### 4.4 Realtime

1. Two devices in same thread — send message both directions

- [ ] Appears without refresh
- [ ] Edit syncs on other device (WebSocket `message_updated`)

---

## 5. Folders

### 5.1 Create permissions

| Role | Create folder |
|------|----------------|
| Admin | [ ] Allowed |
| Employee | [ ] Allowed |
| Client | [ ] **Denied** (no create UI) |

### 5.2 Access control

1. Admin creates folder → grant Employee A only
2. Log in Employee A → folder visible
3. Log in Employee B / ungranted client → folder hidden

- [ ] ACL enforced

### 5.3 Cross-portal media

1. Admin uploads image/video/doc to folder
2. Employee opens same folder item
3. Client opens item (if granted)

- [ ] Admin media visible in employee portal
- [ ] Employee media visible in client portal (when granted)
- [ ] Admin media visible in client portal (when granted)

### 5.4 Folder UX

1. Search folder by name
2. Open link item → correct redirect
3. Play video in-app
4. Open photo in gallery viewer
5. Open document in viewer
6. Download each media type

- [ ] All behaviors work on Android

---

## 6. Diet

### 6.1 Client upload

1. Client → Diet plan
2. Upload photo for today → add second photo same day

- [ ] Day number and date correct
- [ ] Multiple photos per day
- [ ] Timestamp shown

### 6.2 Employee view

1. Employee → open client diet (read-only path)

- [ ] Can view photos
- [ ] **Cannot** upload to client diet
- [ ] Days ordered top → bottom (newest policy per design)

---

## 7. Notifications

1. Log in → send message from another user to this device

- [ ] Push/in-app notification received

2. Log out → send another message

- [ ] No notification to logged-out user

3. Force logout (section 1.3) while logged in

- [ ] Notifications cleared / token removed (verify server `fcm_tokens` if possible)

4. Kill app → ensure logged out → send message

- [ ] No push delivery

---

## 8. Storage (Admin)

1. Admin → Storage tab
2. Observe MongoDB and S3 ring charts

- [ ] Charts render
- [ ] Used / Free % plausible
- [ ] At ≥75% used → **amber** warning text
- [ ] At ≥90% used → **red** warning (use env quota or mock if needed)

3. Tap **Refresh**

- [ ] Data updates

4. Stay on tab 5+ minutes

- [ ] Auto-refresh (~5 min) updates timestamp/data

---

## 9. Reports (Admin)

1. Reports → search user by **name**, **ID**, **phone**

- [ ] Correct user found each time

2. Open **Employee** report → scroll all sections

- [ ] All sections load

3. Open **Client** report → verify diet photos

- [ ] Photos load in report view

4. Generate **PDF** → download

- [ ] No server error
- [ ] File downloads
- [ ] Filename format correct (per product spec)
- [ ] All sections present in PDF

---

## 10. Language (EN / HI / TE)

For **Admin**, **Employee**, and **Client**:

1. Open ⋮ menu → **Language** (above About)
2. Switch **English** → verify UI strings
3. Switch **Hindi** → verify UI
4. Switch **Telugu** → verify UI
5. Kill app → reopen

- [ ] Language persists after kill

6. Log out → log in

- [ ] Language persists (or resets per spec — document actual behavior)

7. Send a chat message with English text

- [ ] User message **not** translated

8. Spot-check: Login, Chat header, Settings, Admin Users tab

- [ ] No obvious English-only blocks on critical screens

---

## 11. About screen

On each portal: ⋮ → **About**

- [ ] Screen opens
- [ ] Version number matches build (`package.json` / native version)
- [ ] Developer name displays
- [ ] Static content readable

---

## 12. Complaints (Client + Admin)

1. Client → raise complaint
2. Admin → Complaints → Pending → mark Solved

- [ ] Client submission works
- [ ] Admin list filters Pending/Solved
- [ ] Stats cards (Pending/Solved only — no “Active clients” card)

---

## 13. Referrals & account creation

- [ ] Client referral flow (if enabled)
- [ ] Admin referrals pane loads table
- [ ] Create account (admin / permitted employee)

---

## 14. API spot checks (optional, Postman)

Use bearer token from login.

| Request | Expected |
|---------|----------|
| `GET /api/auth/session/validate` (no header) | `valid: false` |
| `GET /api/users` (no token) | 401 |
| `PATCH /api/messages/{id}` (other user’s message) | 403 |
| `POST /api/messages/{id}/star` | 200 + listed in starred GET |

- [ ] Document any unexpected status codes

---

## 15. Performance (subjective)

| Metric | Target | Pass? |
|--------|--------|-------|
| Cold app launch | &lt; 3 s | [ ] |
| Open active chat | &lt; 1 s | [ ] |
| Image upload in chat | Compressed reasonably | [ ] |
| Navigate 20 screens | No growing lag / crash | [ ] |
| Typical API call | &lt; 2 s on production network | [ ] |

---

## 16. Edge cases

- [ ] Airplane mode → friendly offline message
- [ ] Empty states: no users, no messages, no folders, no starred
- [ ] Very long message text — layout OK
- [ ] Large image upload (chat + diet)
- [ ] Start upload → force logout mid-upload — no crash, safe error
- [ ] Background app 2 min → foreground — session still valid

---

## Sign-off

| Role | Tester | Date | Pass/Fail |
|------|--------|------|-----------|
| Admin | | | |
| Employee | | | |
| Client | | | |

**Blocking issues:** _(list)_  

**Approved for production:** [ ] Yes  [ ] No
