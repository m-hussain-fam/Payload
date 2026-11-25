# Users Migration — Old Wisden CMS → Payload (`cricket-cms`)

**Status:** ✅ First import completed (18 Nov 2026)  
**Date:** 18 Nov 2026  
**Source DB:** `wisden-postgres` → `siwafmasstg` → `labwis`  
**Target:** Payload `users` (+ `roles`, `media`)

---

## 0. Locked decisions (team)

| Topic | Decision |
|---|---|
| Password | **Confirmed — same for all:** `1234567` |
| Missing email | Seed `{sanitizedUsername}@example.com` |
| Existing email | Keep real email as-is |
| Login | All migrated users login with **email + password** |
| Roles | **1:1 same names** as old CMS (`Authors`, `Wisden Admin`, `CMS Super Admin`, …) — no collapse |
| Duplicates | **Skip** (first wins in run order by `user_id`) |
| Photos | `https://www.wisden.com` + `/static-assets/...` — **curl GET verified 200 + real bytes** |
| Scope | Import active non-deleted users (~611); site readers (`labwis_web_user`) excluded |

### Photo paths found in DB

| Pattern | Count | Example |
|---|---|---|
| `/static-assets/uploads/...` | **29** | `/static-assets/uploads/e9/83/64/70069b96-....jpg` |
| Full `http://...` | **1** | `http://ttmum.in/` (junk — likely skip/fail avatar) |

Script final URL example:

```text
https://www.wisden.com/static-assets/uploads/e9/83/64/70069b96-d4c6-4eaf-a10a-394115c241f5.jpg
```

**Curl check (18 Nov 2026):** GET on sample URLs → `200` + real file sizes (e.g. 25KB, 52KB, ~1MB).  
Note: HEAD sometimes shows `Content-Length: 0`; script uses GET download so OK.  
Prefer host **`https://www.wisden.com`** (`wisden.com` 307 → www).

---

## 1. Goal

Purane `labwis_user` → Payload `users` taake:

- CMS login email/password se chale (shared password for now)
- Bylines baad me `legacyUserId` se map hon
- Bio / social / designation / avatar migrate hon

**Out of scope:**

- `labwis_web_user` (OTP site members)
- Article ↔ author links (`labwis_author_action`) — articles phase
- Old password hash reuse

---

## 2. Existing users snapshot (source)

| Metric | Count |
|---|---|
| Total active users | **611** |
| With email | **77** |
| Without email → dummy `@example.com` | **534** |
| With bio | 28 |
| With designation | 29 |
| With photo | 30 |
| With social JSON | 64 |
| Duplicate emails | 2 pairs → **skip** |
| Duplicate usernames | 1 pair → **skip** |

### By role

| Old role | Users | With email |
|---|---|---|
| Authors | 591 | 57 |
| Wisden Admin | 9 | 9 |
| Web Team | 3 | 3 |
| Wisden Tech Team | 3 | 3 |
| CMS Super Admin | 1 | 1 |
| Admin | 1 | 1 |
| QA Team | 1 | 1 |
| Photobooth Admin | 1 | 1 |
| Sample_role | 1 | 1 |

### Known duplicates (will be skipped on 2nd occurrence)

| Type | Value | user_ids |
|---|---|---|
| email | `adam.hopkins@forwardpress.uk` | 11481, 11421 |
| email | `lzbs21101995@gmail.com` | 603881, 603901 |
| username | `zebbs` (case-insensitive) | 603881, 603901 |

---

## 3. Field mapping

| Old (`labwis_user`) | Payload `users` |
|---|---|
| `user_id` | `legacyUserId` |
| `user_name` | `username` |
| `full_name` / `display_name` | `name` |
| `email_id` or dummy | `email` |
| — | `password` = `1234567` |
| joined `role_name` | `role` → `roles` (see map below) |
| `user_name` normalized | `slug` |
| `bio` | `bio` |
| `designation` | `designation` |
| `socialdata` | `social.*` |
| `profile_picture_url` → fetch | `avatar` → `media` |
| `is_active` | `isActive` |

### Role map

**Exact old names** → Payload `roles.name` (no rename):

`CMS Super Admin`, `Admin`, `Authors`, `Web Team`, `Wisden Admin`, `QA Team`, `Photobooth Admin`, `Wisden Tech Team`, `Sample_role`, …

Missing role rows are created automatically on import.

### Social JSON → fields

Old: `[{ id: "Instagram"|"Facebook"|"Twitter", username, url }, ...]`  
→ `instagramUsername/Url`, `facebookUsername/Url`, `twitterUsername/Url`

---

## 4. Challenges (remaining / known)

| Challenge | Status |
|---|---|
| 534 missing emails | **Solved** — `@example.com` dummy |
| Shared weak password | **Accepted for migrate** — change later in prod |
| Duplicate email/username | **Skip** for now |
| Photo download may 403/404 from wisden.com | Script logs warn, user still created without avatar |
| Payload login is email (not username) | Editors ko email bataani hogi |
| `onInit` seed may conflict with migrate | Stabilize seed before live run |
| Old permission matrix not migrated | Only role names; access rules still TODO |
| Language field not on Users | Skipped unless we add field |

---

## 5. Script

File: `scripts/migrate-users.ts`

```bash
# 1) Dry run — CSV report only, no DB writes to Payload users
pnpm migrate:users:dry

# 2) Live import
pnpm migrate:users

# Optional: skip downloading avatars
MIGRATE_SKIP_AVATARS=1 pnpm migrate:users

# Optional overrides
SOURCE_DATABASE_URL=postgresql://wafwebagent:PASSWORD@127.0.0.1:5401/siwafmasstg
WISDEN_ASSET_BASE=https://www.wisden.com
```

Reports:

- `docs/users-migration-dry-run.csv`
- `docs/users-migration-live.csv`

Idempotent: if `legacyUserId` already exists in Payload → skip.

---

## 6. Recommended run order

1. Answer open questions below  
2. Ensure `wisden-postgres` up on `5401`, `cricket-postgres` on `5433`  
3. `pnpm migrate:users:dry` → review CSV  
4. Fix `onInit` seed if it recreates admin every boot  
5. `pnpm migrate:users` (or with `MIGRATE_SKIP_AVATARS=1` first)  
6. Spot-check login: one real email + one `@example.com` user with password `1234567`  
7. Later: articles remap via `legacyUserId`

---

## 7. Still open (optional)

1. **Avatars in first live run:** download now, or pehle `MIGRATE_SKIP_AVATARS=1`?  
2. Seeded Payload admin (`mianmazhar301@gmail.com`) — rehne do; agar old DB me same email ho to clash handle?

---

## 8. Quick reference — target fields

| Field | Required | Unique |
|---|---|---|
| `email` | yes | yes |
| `password` | yes on create | — |
| `name` | yes | — |
| `username` | yes | yes |
| `role` | yes | — |
| `slug` | no | yes if set |
| `bio` / `designation` / `social` / `avatar` | no | — |
| `legacyUserId` | set by script | recommended unique later |
| `isActive` | default true | — |
)
