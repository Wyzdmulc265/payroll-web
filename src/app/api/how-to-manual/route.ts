import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { canViewHowTo } from '@/lib/how-to-nav';
import { getCurrentUser, unauthorized, forbidden } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getCurrentUser(request);
  if (!session) return unauthorized();
  if (!canViewHowTo(session.user.role)) return forbidden();

  const manualPath = path.join(process.cwd(), 'docs', 'how-to-manual.md');
  const markdown = await readFile(manualPath, 'utf8');

  return NextResponse.json(
    { success: true, data: { markdown } },
    {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}
