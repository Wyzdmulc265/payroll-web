# Refresh `.env.example` to match current auth and mail setup

**Type:** refactor
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#5`

## 1. Why

`.env.example` still referenced `NEXTAUTH_URL` and `NEXTAUTH_SECRET`
from the removed `next-auth` dependency, and was missing the SMTP
variables and `SESSION_DURATION_DAYS` that the current code reads.

## 2. What changed

- Removed `NEXTAUTH_URL` and `NEXTAUTH_SECRET`.
- Added `AUTH_SECRET`, `SESSION_COOKIE_NAME`, SMTP variables, and
  rate-limit / session duration variables.
- Grouped related variables with comments.

## 3. How it works

The file is documentation only; it is never loaded by the app.
Developers copy it to `.env.local` and fill in real values.

## 4. What got better

| Before | After |
|--------|-------|
| Stale `NEXTAUTH_*` keys that no longer work. | Keys match the current custom auth + mail code. |
| No SMTP guidance for new developers. | SMTP block is explicit and copy-paste ready. |

## 5. Risks and trade-offs

- None. This is a documentation-only change.

## 6. Test plan

- `cp .env.example .env.local` → verify no missing keys when the app
  boots in development.

## 7. Follow-ups

- Update `README.md` to point to `.env.example` for setup instructions.
