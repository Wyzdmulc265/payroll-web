'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PAYROLL_OPERATOR' | 'VIEWER';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  businessId: string | null;
}

const UserContext = createContext<CurrentUser | null | undefined>(undefined);

/**
 * Provides the current user to all children via useCurrentUser().
 *
 * When `initialUser` is supplied by the server-rendered layout the nav
 * renders immediately with no client-side fetch.  Otherwise a one-shot
 * /api/auth/me call fires on mount.
 *
 * Tri-state: `undefined` while loading, `null` when not authenticated,
 * `CurrentUser` when authenticated.
 */
export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: CurrentUser | null;
}) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(
    initialUser ?? undefined,
  );

  useEffect(() => {
    // If the server already gave us the user, skip the fetch.
    if (initialUser !== undefined) return;

    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          setUser(json.data as CurrentUser);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        // Network error — mark as unauthenticated; proxy will redirect if needed.
        setUser(null);
      });
  }, [initialUser]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Returns the currently authenticated user: `undefined` while loading,
 * `null` if not authenticated.
 */
export function useCurrentUser(): CurrentUser | null | undefined {
  return useContext(UserContext);
}
