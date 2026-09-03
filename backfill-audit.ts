/**
 * Reviewed backfill / archival helper for historical AuditLog rows (Phase 8).
 *
 * Policy (documented in docs/changes/2026-09-03-phase-8-audit-completeness.md):
 *  - Audit logging shipped together with authentication, so pre-auth rows
 *    (actor `system`, no business) are not expected to exist. This script
 *    verifies that and, if orphan rows ever appear (e.g. from manual data
 *    imports), offers an explicit, reviewed way to associate them with a
 *    business.
 *  - Historical actor identity stays nullable by design: `AuditLog.userId`
 *    and `AuditLog.businessId` are optional columns (onDelete: SetNull), so
 *    rows whose user was hard-deleted remain queryable under the business.
 *
 * Usage:
 *   npx tsx backfill-audit.ts                 # dry-run report (safe)
 *   npx tsx backfill-audit.ts --apply --business-id <cuid>
 *
 * `--apply` without `--business-id` refuses to run.
 */
import prisma from './src/lib/prisma';

const apply = process.argv.includes('--apply');
const businessIdFlagIdx = process.argv.indexOf('--business-id');
const targetBusinessId =
  businessIdFlagIdx !== -1 ? process.argv[businessIdFlagIdx + 1] : undefined;

async function main() {
  const total = await prisma.auditLog.count();
  const orphans = await prisma.auditLog.count({ where: { businessId: null } });
  const anonymous = await prisma.auditLog.count({ where: { userId: null } });

  console.log('=== AuditLog historical-row report ===');
  console.log(`Total audit rows:            ${total}`);
  console.log(`Rows with no businessId:     ${orphans}`);
  console.log(`Rows with no userId:         ${anonymous} (expected: system/legacy rows, kept nullable by design)`);

  if (orphans === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const sample = await prisma.auditLog.findMany({
    where: { businessId: null },
    select: { id: true, action: true, entityType: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
    take: 20,
  });
  console.log('\nSample orphan rows (oldest 20):');
  for (const row of sample) {
    console.log(`  ${row.timestamp.toISOString()}  ${row.action}  ${row.entityType}  (${row.id})`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with `--apply --business-id <cuid>` to assign all orphan rows to that business.');
    return;
  }

  if (!targetBusinessId) {
    console.error('ERROR: --apply requires --business-id <cuid>. Refusing to guess a business.');
    process.exit(1);
  }

  const business = await prisma.business.findUnique({ where: { id: targetBusinessId } });
  if (!business) {
    console.error(`ERROR: no business with id ${targetBusinessId}`);
    process.exit(1);
  }

  const res = await prisma.auditLog.updateMany({
    where: { businessId: null },
    data: { businessId: targetBusinessId },
  });
  console.log(`\nBackfilled ${res.count} audit rows into business "${business.name}" (${business.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
