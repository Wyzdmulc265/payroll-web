# Add CSRF / same-origin guard to proxy

**Type:** security
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#2`

## 1. Why

Mutating API routes (`POST`, `PUT`, `PATCH`, `DELETE`) were reachable
from any origin. A logged-in user could be tricked into submitting a
cross-origin form or `fetch()` request from a malicious site, and the
cookie-based session would authenticate it. This is the classic CSRF
attack vector.

## 2. What changed

- `src/proxy.ts` now rejects cross-origin mutating requests with `403`.
- The guard checks the `Origin` header (browser requests) or `Referer`
  header (older browsers / non-CORS contexts) against the request's
  own host.
- Public paths (login, password-reset, auth API) are unaffected.

## 3. How it works

A new `isSameOrigin()` helper parses the incoming `Origin` header and
compares its `host` to `request.nextUrl.host`. If neither `Origin` nor
`Referer` is present, the request is allowed through (server-to-server
clients typically omit both).

```ts
// src/proxy.ts
if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isSameOrigin(request)) {
  return NextResponse.json(
    { success: false, error: 'Origin not allowed' },
    { status: 403 }
  );
}
```

## 4. What got better

| Before | After |
|--------|-------|
| Mutating routes accepted from any origin. | Cross-origin mutating requests return 403. |
| CSRF possible via hidden form or `fetch()`. | Same-origin policy enforced at the edge. |

Ties to the qualities in `docs/README.md#why-this-app-is-special`:

- **Statutorily correct** — prevents silent data corruption from
  cross-origin state changes.

## 5. Risks and trade-offs

- Non-browser clients (cURL, Postman, integrations) that omit both
  `Origin` and `Referer` are still allowed. If you need to block
  those, switch to a token-based CSRF strategy.
- The check runs in the proxy (edge runtime), so it has zero DB
  overhead.

## 6. Test plan

- **Manual**: open DevTools → Network → replay a `POST /api/settings`
  with `Origin: https://evil.example` → verify `403`.
- **Unit**: add a proxy test that asserts `403` for a cross-origin
  `POST` and `200` for a same-origin `POST`.
- Run `npm run lint && npx tsc --noEmit && npm test`.

## 7. Follow-ups

- Add a similar guard to the `NextResponse.next()` path for WebSocket
  upgrades if the app ever uses them.
- Consider adding a `X-CSRF-Token` header check for extra defense in
  depth (tracked in `docs/IMPROVEMENTS.md#25`).
