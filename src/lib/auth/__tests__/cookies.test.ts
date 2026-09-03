import { describe, expect, it } from 'vitest';
import type { NextResponse } from 'next/server';
import { setSessionCookie, clearSessionCookie } from '../cookies';

interface MockCookieStore {
  _store: Map<string, { value: string; options: Record<string, unknown> }>;
  set(options: { name: string; value: string; [key: string]: unknown }): void;
  get(name: string): { value: string; [key: string]: unknown } | undefined;
}

function createMockResponse(): { cookies: MockCookieStore } {
  const store = new Map<string, { value: string; options: Record<string, unknown> }>();
  return {
    cookies: {
      _store: store,
      set(options: { name: string; value: string; [key: string]: unknown }) {
        const { name, value, ...rest } = options;
        store.set(name, { value, options: rest });
      },
      get(name: string) {
        const entry = store.get(name);
        if (!entry) return undefined;
        return { value: entry.value, ...entry.options };
      },
    },
  };
}

describe('session cookies', () => {
  it('sets HttpOnly, SameSite lax, and secure-in-production on setSessionCookie', () => {
    const response = createMockResponse();
    const expiresAt = new Date(Date.now() + 60_000);
    setSessionCookie(response as unknown as NextResponse, 'test-token', expiresAt);

    const cookie = response.cookies.get('payroll_session');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('lax');
    expect(cookie!.secure).toBe(process.env.NODE_ENV === 'production');
    expect(cookie!.path).toBe('/');
  });

  it('clears the session cookie with maxAge 0 and empty value', () => {
    const response = createMockResponse();
    clearSessionCookie(response as unknown as NextResponse);

    const cookie = response.cookies.get('payroll_session');
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe('');
    expect(cookie!.maxAge).toBe(0);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('lax');
    expect(cookie!.path).toBe('/');
  });
});
