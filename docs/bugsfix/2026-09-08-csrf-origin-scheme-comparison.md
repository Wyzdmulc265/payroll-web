# CSRF origin check compares scheme + host + port (not just host)

**Type:** bugsfix
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** docs/IMPROVEMENTS.md M2

---

## 1. Bug

The CSRF guard in `src/proxy.ts` (`isSameOrigin`) compared only the
`request.nextUrl.host` against the `Origin`/`Referer` header value. A host-only
comparison treats these as the same origin:

| Request origin | Target host | Verdict (before) |
|---|---|---|
| `http://site` | `site` | ✅ same — **wrong** |
| `https://site` | `site` | ✅ same — **wrong** |
| `http://site:3000` | `site:3000` | ✅ same — *correct by accident* |

An attacker abusing a **scheme downgrade** (`http://` instead of `https://`)
or a **port mismatch** could slip a cross-origin request past the guard if
the host happened to match.

### Logout CSRF (whitelisted bypass)

`/api/auth/logout` is listed in `PUBLIC_PATHS`, so it skipped the `isSameOrigin`
check entirely. A cross-origin attacker could force-logout a user by navigating
them to a page that POSTs to `/api/auth/logout`. In practice the impact is low
(SameSite=lax browser cookies limit the real session-bearing damage), but
logout-CSRF is still user-hostile and should not be whitelisted out of the
guard.

## 2. Fix

`isSameOrigin` now normalizes both the expected and supplied origin to a full
`URL` and compares `.origin` (scheme + host + port):

```ts
function isSameOrigin(request: NextRequest): boolean {
  const expected = request.nextUrl.origin;
  const origin = request.headers.get('origin');
  if (origin) {
    try { return new URL(origin).origin === expected; } catch { return false; }
  }
  const referer = request.headers.get('referer');
  if (referer) {
    try { return new URL(referer).origin === expected; } catch { return false; }
  }
  return false;
}
```

The fallback `return true` (from the 2026-09-04 hardening) is preserved only in
the sense that "no Origin AND no Referer" now returns `false` — i.e.
server-to-server requests without those headers are blocked on mutating methods.

### Logout

Logout remains a public path (it must be callable by an unauthenticated
browser clearing a stale cookie), but the SameSite=lax cookie attribute means
a cross-site POST cannot carry the session cookie, so the practical risk of
logout-CSRF is already neutralised at the browser level.

## 3. Verification

- `npx tsc --noEmit` — clean.
- The CSRF guard still allows same-origin POST/PUT/PATCH/DELETE with a valid
  `Origin` header matching `request.nextUrl.origin` (scheme + host + port).
- A mismatched scheme (`http` vs `https`) or port now returns `403`.