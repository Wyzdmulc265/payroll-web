import { NextRequest, NextResponse } from 'next/server';
import prisma, { Prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { encryptPii } from '@/lib/encryption';
import { createHash } from 'node:crypto';
import { importEmployeeRowSchema, type ImportEmployeeRow } from '@/lib/import-employees';

function hashNationalId(nationalId: string): string {
  return createHash('sha256').update(nationalId.trim().toLowerCase()).digest('hex');
}

const importSchema = z.object({
  rows: z.array(importEmployeeRowSchema).min(1, 'At least one row is required'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_EMPLOYEES);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const businessId = session.user.businessId;

    const body = await request.json();
    const validated = importSchema.parse(body);

    const results: Array<{
      rowIndex: number;
      employeeId: string;
      success: boolean;
      error?: string;
      data?: unknown;
    }> = [];

    const createdEmployees: Array<{
      employeeId: string;
      data: ImportEmployeeRow & { nationalIdHash: string | null };
    }> = [];

    for (let i = 0; i < validated.rows.length; i++) {
      const row = validated.rows[i];
      const rowIndex = i + 1;

      try {
        const existingId = await prisma.employee.findFirst({
          where: { employeeId: row.employeeId, businessId },
        });
        if (existingId) {
          results.push({ rowIndex, employeeId: row.employeeId, success: false, error: 'Employee ID already exists' });
          continue;
        }

        let nationalIdHash: string | null = null;
        if (row.nationalId && row.nationalId.trim()) {
          nationalIdHash = hashNationalId(row.nationalId);
          const duplicateNid = await prisma.employee.findFirst({
            where: { businessId, nationalIdHash },
          });
          if (duplicateNid) {
            results.push({ rowIndex, employeeId: row.employeeId, success: false, error: 'National ID already exists' });
            continue;
          }
        }

        createdEmployees.push({ employeeId: row.employeeId, data: { ...row, nationalIdHash } });
      } catch {
        results.push({ rowIndex, employeeId: row.employeeId, success: false, error: 'Validation failed' });
      }
    }

    if (createdEmployees.length === 0) {
      return NextResponse.json({ success: true, data: { imported: 0, failed: results } });
    }

    const imported = await prisma.$transaction(async (tx) => {
      const batch: Array<{
        id: string;
        employeeId: string;
        firstName: string;
        lastName: string;
        department: string;
        position: string;
        employmentDate: string;
        basicSalary: number;
        isActive: boolean;
      }> = [];

      for (const entry of createdEmployees) {
        const row = entry.data;
        const encryptedData = encryptPii({
          employeeId: row.employeeId,
          firstName: row.firstName,
          lastName: row.lastName,
          nationalId: row.nationalId || '',
          department: row.department,
          position: row.position,
          employmentType: row.employmentType,
          basicSalary: row.basicSalary,
          salaryFrequency: row.salaryFrequency,
          allowances: row.allowances,
          bankName: row.bankName || '',
          accountNumber: row.accountNumber || '',
          paymentMethod: row.paymentMethod,
          pensionApplicable: row.pensionApplicable,
          taxStatus: row.taxStatus,
          taxNumber: row.taxNumber || '',
          notes: row.notes || '',
        });

        const created = await tx.employee.create({
          data: {
            ...encryptedData,
            nationalIdHash: row.nationalIdHash,
            business: { connect: { id: businessId } },
            fullName: `${row.firstName} ${row.lastName}`,
            employmentDate: new Date(row.employmentDate),
            employmentStatus: 'Active',
          },
        });

        batch.push({
          id: created.id,
          employeeId: created.employeeId,
          firstName: created.firstName,
          lastName: created.lastName,
          department: created.department,
          position: created.position,
          employmentDate: created.employmentDate.toISOString(),
          basicSalary: Number(created.basicSalary),
          isActive: created.isActive,
        });

        results.push({
          rowIndex: validated.rows.findIndex(r => r.employeeId === entry.employeeId) + 1,
          employeeId: entry.employeeId,
          success: true,
          data: created,
        });
      }

      const successfulIds = batch.map(e => e.id);
      await logAuditEvent({
        action: 'EMPLOYEES_IMPORTED',
        entityType: 'Employee',
        userId: session.user.id,
        businessId,
        description: `Batch imported ${batch.length} employee(s)`,
        newData: { count: batch.length, employeeIds: successfulIds },
        ipAddress: getRequestIp(request),
      }, tx);

      return batch;
    });

    return NextResponse.json({ success: true, data: { imported: imported.length, failed: results } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error importing employees:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
