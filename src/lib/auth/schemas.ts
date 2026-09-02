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
