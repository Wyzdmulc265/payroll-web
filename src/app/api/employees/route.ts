import { NextRequest, NextResponse } from 'next/server';
import prisma, { Prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';

const employeeSchema = z.object({
  employeeId: z.string().regex(/^EMP\d{3}$/, 'Employee ID must be in format EMPXXX'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationalId: z.string().optional(),
  department: z.string().min(1),
  position: z.string().min(1),
  employmentDate: z.coerce.date(),
  employmentType: z.enum(['Permanent', 'Contract']).default('Permanent'),
  basicSalary: z.number().positive(),
  salaryFrequency: z.string().default('Monthly'),
  allowances: z.number().nonnegative().default(0),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  paymentMethod: z.string().default('Bank Transfer'),
  pensionApplicable: z.boolean().default(true),
  taxStatus: z.string().default('Taxable'),
  taxNumber: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.READ_EMPLOYEES);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const asOf = searchParams.get('asOf');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = { businessId: session.user.businessId };
    
    if (department && department !== 'All') {
      where.department = department;
    }
    
    if (status && status !== 'All') {
      where.employmentStatus = status;
    }

    if (asOf) {
      where.employmentDate = { lte: new Date(asOf) };
    }
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      // Prisma Decimal serializes to a string in JSON; coerce money fields to
      // numbers so clients never receive strings that would concatenate on "+".
      data: employees.map((e) => ({
        ...e,
        basicSalary: Number(e.basicSalary),
        allowances: Number(e.allowances),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_EMPLOYEES);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const businessId = session.user.businessId;
    const body = await request.json();
    const validatedData = employeeSchema.parse(body);

    // Check for duplicate employeeId
    const existing = await prisma.employee.findFirst({
      where: {
        employeeId: validatedData.employeeId,
        businessId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Employee ID already exists' },
        { status: 400 }
      );
    }

    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          ...validatedData,
          business: { connect: { id: businessId } },
          fullName: `${validatedData.firstName} ${validatedData.lastName}`,
          employmentDate: new Date(validatedData.employmentDate),
        },
      });

      await logAuditEvent({
        action: 'EMPLOYEE_CREATED', entityType: 'Employee', entityId: created.id,
        userId: session.user.id, businessId,
        description: `Created employee ${created.employeeId}`, newData: created,
        ipAddress: getRequestIp(request),
      }, tx);

      return created;
    });

    return NextResponse.json({ success: true, data: employee }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}