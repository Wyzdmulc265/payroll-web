import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext, unauthorized } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSessionContext(request);
  if (!session) return unauthorized();
  return NextResponse.json({ success: true, data: session.user });
}
