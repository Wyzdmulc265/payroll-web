import prisma from './src/lib/prisma';

async function main() {
  console.log('Starting backfill...');

  // Find a business to use as default (assuming the seed created one)
  const business = await prisma.business.findFirst();
  if (!business) {
    console.error('No business found. Cannot backfill.');
    process.exit(1);
  }

  console.log(`Using business: ${business.name} (${business.id})`);

  // Employee and PayrollRecord.businessId are required (non-nullable) in the
  // schema, so Prisma's type-safe updateMany does not accept null filters.
  // Historical rows that pre-date the businessId requirement may still hold
  // NULL in the database; use raw SQL to reach and repair them.
  const empCount = await prisma.$executeRaw`
    UPDATE "employees" SET "business_id" = ${business.id} WHERE "business_id" IS NULL
  `;
  console.log(`Updated ${empCount} employees.`);

  const prCount = await prisma.$executeRaw`
    UPDATE "payroll_records" SET "business_id" = ${business.id} WHERE "business_id" IS NULL
  `;
  console.log(`Updated ${prCount} payroll records.`);

  // Settings.businessId is nullable, so the type-safe API accepts null.
  const settingRes = await prisma.settings.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });
  console.log(`Updated ${settingRes.count} settings.`);

  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
