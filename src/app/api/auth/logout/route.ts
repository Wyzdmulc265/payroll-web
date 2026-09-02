import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { clearSessionCookie, getSessionContext, invalidateSession, SESSION_COOKIE } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionContext(request);
  if (session) {
    await prisma.$transaction(async (tx) => {
      if (token) await invalidateSession(token, tx);
      await logAuditEvent({
        action: 'LOGOUT',
        entityType: 'Auth',
        entityId: session.user.id,
        userId: session.user.id,
        businessId: session.user.businessId,
        description: 'User logged out',
        ipAddress: getRequestIp(request),
      }, tx);
    });
  } else if (token) {
    await invalidateSession(token);
  }
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
