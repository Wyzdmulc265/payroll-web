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
 * Fetches the current user from /api/auth/me once on mount and makes it
 * available to all children via useCurrentUser(). Tri-state: `undefined`
 * while the request is in flight (so shells like MainNav can render
 * skeletons instead of a blank panel), `null` when not authenticated (the
 * proxy will have already redirected the browser to /login before this
 * point, so null is only observable transiently).
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
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
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Returns the currently authenticated user: `undefined` while loading,
 * `null` if not authenticated.
 */
export function useCurrentUser(): CurrentUser | null | undefined {
  return useContext(UserContext);
}
