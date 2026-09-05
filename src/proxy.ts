/**
 * src/proxy.ts — Next.js 16 request proxy (formerly middleware.ts)
 *
 * Runs before every matched request. Only reads the session cookie —
 * intentionally no Prisma/DB calls (the full session validation is done
 * inside each API route handler where it is safe to do so).
 *
 * Public paths that do NOT require a session:
 *   /login, /forgot-password, /reset-password/*
 *   /api/auth/login, /api/auth/logout, /api/auth/forgot-password, /api/auth/reset-password
 *   /_next/static, /_next/image, /favicon.ico (excluded by matcher below)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Must match the constant in src/lib/auth/session.ts without importing it
// (importing from lib would pull Prisma into the proxy runtime).
const SESSION_COOKIE = '__Host-payroll_session';

/** Paths that are publicly accessible without authentication. */
const PUBLIC_PATHS: (string | RegExp)[] = [
  '/login',
  '/forgot-password',
  /^\/reset-password(\/.*)?$/,
  // Auth API routes
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    typeof p === 'string' ? pathname === p || pathname.startsWith(p + '/') : p.test(pathname)
  );
}

function isSameOrigin(request: NextRequest): boolean {
  const host = request.nextUrl.host;
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host === host;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }
  // No Origin or Referer header — treat as untrusted (e.g. curl, Postman, server-to-server).
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths through.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Block cross-origin mutating requests (CSRF guard).
  const method = request.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: 'Origin not allowed' },
      { status: 403 }
    );
  }

  // Check for session cookie presence (value is opaque; DB validation is in route handlers).
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (hasSession) {
    return NextResponse.next();
  }

  // --- Unauthenticated ---

  // API requests: return 401 JSON so the client can handle it programmatically.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Browser page requests: redirect to /login, preserving the intended destination.
  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('from', pathname);
  }

  // Clear the expired/missing cookie on the redirect response to avoid stale state.
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
