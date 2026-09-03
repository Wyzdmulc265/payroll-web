import 'dotenv/config';

// Tests perform destructive cleanup (user.deleteMany(), business.deleteMany(),
// etc.). NEVER let them target the production database. If DATABASE_URL_TEST is
// provided, redirect the Prisma client used by tests to the isolated test DB.
const testUrl = process.env.DATABASE_URL_TEST;
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
} else if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL) {
  // No dedicated test DB configured: fail loudly so tests cannot silently
  // wipe whatever DATABASE_URL points at.
  throw new Error(
    'DATABASE_URL_TEST is not set. Tests run destructive cleanup and must target an isolated test database, never production.'
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set in the environment');
}
