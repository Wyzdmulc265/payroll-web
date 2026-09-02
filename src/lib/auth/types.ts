import type { Role, UserStatus } from '../../../prisma/generated/client';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  businessId: string | null;
};

export type SessionContext = {
  user: AuthUser;
  sessionId: string;
  expiresAt: Date;
};
