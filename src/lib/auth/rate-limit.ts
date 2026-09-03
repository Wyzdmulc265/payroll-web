import prisma from '../prisma';

/** Failed-login attempts allowed per key before blocking. Configurable via MAX_LOGIN_ATTEMPTS (default: 5). */
const MAX_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5);
/** Rate-limit window in milliseconds. Configurable via RATE_LIMIT_WINDOW_MS (default: 15 minutes). */
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);

export async function checkLoginRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  
  // Find existing
  let current = await prisma.rateLimit.findUnique({ where: { key } });

  if (!current || current.resetAt <= now) {
    // Upsert to handle race conditions where it didn't exist but got created
    current = await prisma.rateLimit.upsert({
      where: { key },
      update: { count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
      create: { key, count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000) };
  }

  await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.delete({ where: { key } });
  } catch {
    // Ignore if not found
  }
}
