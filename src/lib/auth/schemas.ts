import { z } from 'zod';

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'PAYROLL_OPERATOR', 'VIEWER']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  businessId: z.string().nullable(),
});

// Roles an ADMIN/SUPER_ADMIN may assign to managed users. SUPER_ADMIN is
// deliberately excluded so no tenant-scoped user can create or be granted
// SUPER_ADMIN — the only path to SUPER_ADMIN is the bootstrap seed. This is
// the primary privilege-escalation guard for user management; routes also
// re-check the parsed role as defense-in-depth.
export const userRoles = ['ADMIN', 'PAYROLL_OPERATOR', 'VIEWER'] as const;

export const createUserSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: passwordSchema,
  role: z.enum(userRoles),
});

export const updateUserSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  role: z.enum(userRoles).optional(),
  password: passwordSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
