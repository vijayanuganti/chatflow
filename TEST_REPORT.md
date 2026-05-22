# ChatFlow Pre-Production Test Report

**Date:** 2026-05-22  
**Scope:** Admin, Employee, and Client portals (web + Capacitor Android)  
**Repository:** `chatflow`  
**Production API (configured in frontend):** `https://140-245-209-196.sslip.io`

---

## Executive summary

| Layer | Suites | Tests | Result |
|-------|--------|-------|--------|
| Frontend Jest (`npm test`) | 7 | 20 | **All passed** |
| Backend pytest (`backend/tests`) | 2 files | 7 | **All passed** |
| Android JUnit (Capacitor stubs) | 2 | 0 real | **Not implemented** |
| E2E / device QA | — | — | **Manual checklist required** |

Before this run, the project had **no application test suite** (only default Capacitor `ExampleUnitTest` stubs). New automated tests cover **pure helpers** and **unauthenticated API smoke** checks. Most user-facing flows (chat ACL, folders, notifications, PDF reports, single-session timing, performance) still require **manual or E2E** testing.

**No ❌ FAILED product features** were detected by automation. Failures below refer only to **gaps in test coverage**, not confirmed regressions.

---

## Automated test run log

### Frontend

```text
Test Suites: 7 passed, 7 total
Tests:       20 passed, 20 total
```

| File | What it validates |
|------|-------------------|
| `src/lib/__tests__/appLanguage.test.js` | `normalizeLanguage`, `languageDisplayCode` |
| `src/lib/__tests__/accountStatus.test.js` | Client/employee status, user & batch tab filters |
| `src/lib/__tests__/adminSearchFilters.test.js` | Admin search by name, ID, phone, email |
| `src/lib/__tests__/optimisticMessages.test.js` | Own-message detection, sort, optimistic IDs |
| `src/lib/__tests__/messageCanEdit.test.js` | Edit allowed only for own text messages |
| `src/lib/__tests__/forcedLogout.test.js` | `get401LogoutReason` parsing |
| `src/components/admin/__tests__/StorageRingCard.test.js` | Storage byte formatting, 75%/90% warning levels |

**Infrastructure fix applied:** `package.json` `jest.moduleNameMapper` for `@/` aliases (required for i18n imports in tests).

### Backend

```text
7 passed in ~5s (after server module load)
```

| Test | Result |
|------|--------|
| `GET /api/auth/session/validate` (no token) → `{valid: false, reason: no_token}` | ✅ |
| `GET /api/users` without auth → 401 | ✅ |
| `GET /api/admin/storage` without auth → 401 | ✅ |
| `POST /api/auth/login` invalid user → 401/422 | ✅ |
| `normalize_language` (en/hi/te) | ✅ |
| `_pack_storage_used_free` percent math | ✅ |
| `direct_conv_id` stable ordering | ✅ |

**Run commands:**

```bash
cd frontend && CI=true npm test -- --watchAll=false
cd backend && pytest tests -v
```

---

## Codebase inventory (test plan basis)

### Portals & routing

| Portal | Entry | Main surfaces |
|--------|-------|----------------|
| **Admin** | `/admin`, `/admin/:section?` | Overview, Users, Batches, Chat, Folders, Reports, Referrals, Complaints, Storage, More |
| **Employee** | `/chat` | Chat, Folders, Diet (read-only client), Profile, Create account (if permitted) |
| **Client** | `/chat` | Direct chat with assigned employee, Diet upload, Folders (read), Complaints, Profile |

**Shared routes:** `/login`, `/chat/*`, `/admin/users/*`, medical, diet-plan, new-conversation, contact profiles.

### Backend API surface (~100+ routes)

- **Core (`server.py`):** Auth (login, logout, session validate, sessions), users, preferences (language), FCM tokens, admin users/batches/clients, complaints, referrals, conversations/messages (incl. PATCH edit, star/unstar, starred list), notifications, upload/files, diet plans, storage stats.
- **`folders_api.py`:** Folder CRUD, items, grants, media.
- **`diet_api.py`:** Client diet photos by day.
- **`reports_api.py`:** User search, report sections, PDF generation.

---

## Full checklist results

Legend: **✅ PASSED** = covered by passing automated test or smoke check · **📋 MANUAL** = requires device/browser QA · **⚠️ WARNING** = risk or partial coverage · **❌ FAILED** = confirmed failure (none from automation)

### Authentication

| Status | Item |
|--------|------|
| 📋 MANUAL | Login with valid credentials (all roles) |
| ✅ PASSED | Login with invalid credentials — API returns 401/422 for unknown user |
| 📋 MANUAL | Single session enforcement |
| 📋 MANUAL | Force logout when second device logs in |
| ✅ PASSED | Force-logout reason parsing (`get401LogoutReason`) |
| 📋 MANUAL | Correct message shown on force logout (UI) |
| 📋 MANUAL | Token expiry handling |
| 📋 MANUAL | Logout clears all tokens and notifications |

### Navigation

| Status | Item |
|--------|------|
| 📋 MANUAL | All tab navigations (Admin footer, Employee/Client chat tabs) |
| 📋 MANUAL | Back navigation stack (employee details → users, batch → employee) |
| 📋 MANUAL | No broken routes / 404 |
| 📋 MANUAL | Deep links (push notification → chat) |
| 📋 MANUAL | Android hardware back / stack behavior |

### Users module (Admin)

| Status | Item |
|--------|------|
| ✅ PASSED | Search by name, ID, phone, email (`matchesUserSearch`) |
| ✅ PASSED | Tab filtering (`filterUserForTab`, `countUsersForTab`) |
| 📋 MANUAL | Activate / Deactivate employee |
| 📋 MANUAL | Drop client |
| 📋 MANUAL | Employee details page loads |
| ✅ PASSED | Batch tab filters (`filterBatchForTab`) |
| 📋 MANUAL | Back from batch → employee → users |

### Chat

| Status | Item |
|--------|------|
| 📋 MANUAL | Client only chats assigned employee |
| 📋 MANUAL | Client cannot chat with admin |
| 📋 MANUAL | No extra users in client chat list |
| 📋 MANUAL | Client opens chat without list screen |
| 📋 MANUAL | Long press → 3-dot menu |
| ✅ PASSED | Edit only own text messages (`messageCanEdit`) |
| 📋 MANUAL | Star / unstar any message (API + UI) |
| 📋 MANUAL | Starred messages screen |
| 📋 MANUAL | Tap starred row scrolls to message |
| 📋 MANUAL | Edited label on messages |
| 📋 MANUAL | Edit cancel in composer |

### Folders

| Status | Item |
|--------|------|
| 📋 MANUAL | Admin / Employee create; Client cannot create |
| 📋 MANUAL | Access control (granted users only) |
| 📋 MANUAL | Media visibility across portals |
| ✅ PASSED | Folder name search (`matchesFolderSearch`) |
| 📋 MANUAL | Links, in-app video, gallery, document viewer, download |

### Diet

| Status | Item |
|--------|------|
| 📋 MANUAL | Client upload photos, day/date, multiple per day, timestamps |
| 📋 MANUAL | Employee read-only client diet |
| 📋 MANUAL | Employee cannot upload to client diet |
| 📋 MANUAL | Days ordered top-to-bottom |

### Notifications

| Status | Item |
|--------|------|
| 📋 MANUAL | Notifications when logged in |
| 📋 MANUAL | Zero notifications after logout / force logout |
| 📋 MANUAL | Push token removed on logout |
| 📋 MANUAL | No push when app killed and logged out |

### Storage (Admin)

| Status | Item |
|--------|------|
| 📋 MANUAL | MongoDB / S3 ring charts render |
| ✅ PASSED | Used % calculation (`_pack_storage_used_free`) |
| ✅ PASSED | Warning at ≥75% (amber) and ≥90% (red) thresholds |
| 📋 MANUAL | Manual refresh |
| 📋 MANUAL | Auto refresh every 5 minutes |

### Reports (Admin)

| Status | Item |
|--------|------|
| 📋 MANUAL | Search by name / ID / phone |
| 📋 MANUAL | Employee & client report sections |
| 📋 MANUAL | Diet photos in client report |
| 📋 MANUAL | PDF generate, download, filename, section layout |

### Language system

| Status | Item |
|--------|------|
| ✅ PASSED | Language codes en/hi/te normalization |
| 📋 MANUAL | Language in ⋮ menu on all 3 portals |
| 📋 MANUAL | EN / HI / TE switch and persistence (kill app, logout/login) |
| 📋 MANUAL | User-generated content not translated |
| ⚠️ WARNING | Full UI string coverage — many Admin dialogs may still be English |

### About screen

| Status | Item |
|--------|------|
| 📋 MANUAL | Opens from ⋮ on all portals |
| 📋 MANUAL | Version, developer name, content |

### Single session

| Status | Item |
|--------|------|
| 📋 MANUAL | Device 2 login logs out device 1 |
| 📋 MANUAL | Force logout under 1 second |
| 📋 MANUAL | Message on device 1; cannot return to app |

### API endpoints

| Status | Item |
|--------|------|
| ✅ PASSED | 401 without token on protected routes (sample) |
| 📋 MANUAL | All GET/POST/PATCH/DELETE happy paths & 403 ACL |
| 📋 MANUAL | Error response format consistency |
| ⚠️ WARNING | No integration suite with authenticated fixtures |

### Performance

| Status | Item |
|--------|------|
| 📋 MANUAL | App launch &lt; 3s |
| 📋 MANUAL | Chat load &lt; 1s |
| 📋 MANUAL | Image compression |
| 📋 MANUAL | Memory on navigation |
| 📋 MANUAL | API &lt; 2s (production host) |

### Edge cases

| Status | Item |
|--------|------|
| 📋 MANUAL | Offline / empty states / long text / large uploads |
| 📋 MANUAL | Session expires mid-upload |
| 📋 MANUAL | Background → foreground |

---

## Warnings (no fix applied — confirm before changing)

| Item | Risk | Suggested action |
|------|------|------------------|
| **i18n coverage** | Mixed-language UX on some admin screens | Audit `AdminDashboard.jsx` dialogs; extend `en/hi/te.json` |
| **No E2E tests** | Regressions in chat/folders/notifications undetected | Add Playwright or Detox for P0 flows |
| **Backend pytest import** | ~5–70s cold start when loading `server.py` | Extract pure utils to `backend/lib/` for faster unit tests |
| **Pydantic v1 `@validator`** | Deprecation warnings in pytest | Migrate to `@field_validator` (non-urgent) |
| **Legacy `starredMessages.js`** | Possible duplicate localStorage stars if still referenced | Confirm only server-backed star API is used |

---

## Artifacts added in this test pass

- `frontend/src/lib/__tests__/*` (6 suites)
- `frontend/src/components/admin/__tests__/StorageRingCard.test.js`
- `frontend/src/lib/messageCanEdit.js` (extracted from `ChatWindow.jsx`)
- `backend/tests/` (pytest smoke + pure functions)
- `backend/requirements-dev.txt`
- `MANUAL_TEST_CHECKLIST.md` (step-by-step QA)
- `frontend/package.json` — Jest `@/` alias mapper

---

## Next steps for production sign-off

1. Execute **`MANUAL_TEST_CHECKLIST.md`** on Android + browser for all three roles.
2. Record failures as GitHub issues with portal, steps, and screenshots.
3. Expand pytest with authenticated fixtures (test users in staging MongoDB).
4. Add E2E for: login → chat send → edit/star → logout → force logout.
