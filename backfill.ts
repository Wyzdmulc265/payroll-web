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

  const empRes = await prisma.employee.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });
  console.log(`Updated ${empRes.count} employees.`);

  const prRes = await prisma.payrollRecord.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });
  console.log(`Updated ${prRes.count} payroll records.`);

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
