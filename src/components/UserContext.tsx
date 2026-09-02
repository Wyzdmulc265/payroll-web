'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PAYROLL_OPERATOR' | 'VIEWER';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  businessId: string | null;
}

const UserContext = createContext<CurrentUser | null>(null);

/**
 * Fetches the current user from /api/auth/me once on mount and makes it
 * available to all children via useCurrentUser(). A null value means the
 * user is not authenticated (the proxy will have already redirected the
 * browser to /login before this point, so null is only observable during
 * the brief initial render).
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          setUser(json.data as CurrentUser);
        }
      })
      .catch(() => {
        // Network error — leave user as null; proxy will redirect if needed.
      });
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Returns the currently authenticated user, or null if not yet loaded /
 * not authenticated.
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(UserContext);
}
