import type { NextRequest } from 'next/server';
import { getSessionContext } from './session';
import type { SessionContext } from './types';

export async function getCurrentUser(request: NextRequest): Promise<SessionContext | null> {
  return getSessionContext(request);
}
