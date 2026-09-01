import { NextRequest, NextResponse } from 'next/server';
import prisma, { Prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  nationalId: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  employmentDate: z.coerce.date().optional(),
  employmentType: z.enum(['Permanent', 'Contract']).optional(),
  basicSalary: z.number().positive().optional(),
  salaryFrequency: z.string().optional(),
  allowances: z.number().nonnegative().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  paymentMethod: z.string().optional(),
  pensionApplicable: z.boolean().optional(),
  taxStatus: z.string().optional(),
  taxNumber: z.string().optional(),
  notes: z.string().optional(),
  employmentStatus: z.enum(['Active', 'Inactive']).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        payrollRecords: {
          orderBy: { payrollPeriod: 'desc' },
          take: 12,
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    console.error('Error fetching employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateEmployeeSchema.parse(body);

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    const updateData: Prisma.EmployeeUpdateInput = { ...validatedData };
    if (validatedData.firstName || validatedData.lastName) {
      updateData.fullName = `${validatedData.firstName || existing.firstName} ${validatedData.lastName || existing.lastName}`;
    }
    if (validatedData.employmentDate) {
      updateData.employmentDate = new Date(validatedData.employmentDate);
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        user: 'system',
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: id,
        description: `Updated employee ${employee.employeeId}`,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(employee),
      },
    });

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Soft delete - mark as inactive
    const employee = await prisma.employee.update({
      where: { id },
      data: { isActive: false, employmentStatus: 'Inactive' },
    });

    await prisma.auditLog.create({
      data: {
        user: 'system',
        action: 'DEACTIVATE',
        entityType: 'Employee',
        entityId: id,
        description: `Deactivated employee ${employee.employeeId}`,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(employee),
      },
    });

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    console.error('Error deactivating employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}