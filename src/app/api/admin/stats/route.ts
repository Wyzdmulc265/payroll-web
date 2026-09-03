import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  requirePermission,
  Permission,
} from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();

    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const [businessCount, adminCount, payrollRecordCount, recentBusinesses] = await Promise.all([
      prisma.business.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.payrollRecord.count(),
      prisma.business.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true, employees: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        counts: {
          businesses: businessCount,
          admins: adminCount,
          payrollRecords: payrollRecordCount,
        },
        recentBusinesses,
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
