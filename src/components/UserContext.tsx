'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PAYROLL_OPERATOR' | 'VIEWER';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  businessId: string | null;
}

const UserContext = createContext<CurrentUser | null | undefined>(undefined);

/**
 * Auth surfaces that render outside MainNav. On these there is nothing to fetch:
 * the server-rendered `initialUser` is already `null` and the nav is hidden.
 */
const isAuthPath = (pathname: string): boolean =>
  pathname === '/login' ||
  pathname === '/forgot-password' ||
  pathname.startsWith('/reset-password/');

/**
 * Provides the current user to all children via useCurrentUser().
 *
 * Tri-state: `undefined` while loading, `null` when not authenticated,
 * `CurrentUser` when authenticated.
 *
 * The server supplies `initialUser` on the initial (direct) page load. It is
 * NOT re-supplied on a client-side `router.push` — the shared root layout is
 * not re-rendered when navigating between routes that share it (e.g. signing
 * in on /login then router.push('/dashboard')). So whenever we land on a
 * protected page while the user is still unknown, we resolve it from the
 * session cookie via /api/auth/me. That makes the nav self-heal after login
 * no matter how the navigation happened.
 */
export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: CurrentUser | null;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null | undefined>(initialUser);

  const onProtectedPage = !isAuthPath(pathname);

  // A client-side router.push after login does not re-run the root layout, so
  // `initialUser` below stays stale. Re-resolve from the cookie on any
  // protected page where the user is not yet known.
  useEffect(() => {
    if (!onProtectedPage || user) return;

    let active = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        setUser(json?.success && json?.data ? (json.data as CurrentUser) : null);
      })
      .catch(() => {
        // Network error — mark as unauthenticated; proxy will redirect if needed.
        if (active) setUser(null);
      });

    return () => {
      active = false;
    };
  }, [onProtectedPage, user]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Returns the currently authenticated user: `undefined` while loading,
 * `null` if not authenticated.
 */
export function useCurrentUser(): CurrentUser | null | undefined {
  return useContext(UserContext);
}
