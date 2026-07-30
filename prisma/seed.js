const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Hash Admin Password
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 12);
  
  // Create or update Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@novadrive.com' },
    update: {},
    create: {
      name: 'System Admin',
      username: 'admin',
      email: 'admin@novadrive.com',
      phone: '000-000-0000',
      employee_id: 'ADM-001',
      password_hash: adminPasswordHash,
      role: 'ADMIN',
      status: 'Active',
    },
  });
  console.log(`Admin user seeded: ${admin.email}`);

  // Hash Operations Manager Password
  const opsPasswordHash = await bcrypt.hash('Operations123!', 12);

  // Create or update Operations Manager User
  const ops = await prisma.user.upsert({
    where: { email: 'operations@novadrive.com' },
    update: {},
    create: {
      name: 'Operations Manager',
      username: 'operations',
      email: 'operations@novadrive.com',
      phone: '000-000-0001',
      employee_id: 'OPS-001',
      password_hash: opsPasswordHash,
      role: 'OPERATIONS_MANAGER',
      status: 'Active',
    },
  });
  console.log(`Operations Manager user seeded: ${ops.email}`);

  // Hash Driver Password
  const driverPasswordHash = await bcrypt.hash('DriverPass123!', 12);

  // Create or update Driver User
  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@novadrive.com' },
    update: {},
    create: {
      name: 'David Wilson',
      username: 'driver',
      email: 'driver@novadrive.com',
      phone: '000-000-0002',
      employee_id: 'DRV-001',
      password_hash: driverPasswordHash,
      role: 'DRIVER',
      status: 'Active',
    },
  });
  console.log(`Driver user seeded: ${driverUser.email}`);

  // Ensure DriverProfile exists
  const existingProfile = await prisma.driverProfile.findUnique({
    where: { user_id: driverUser.id },
  });
  if (!existingProfile) {
    await prisma.driverProfile.create({
      data: {
        user_id: driverUser.id,
        hire_date: new Date(),
        driving_license_id: 'DL-9081234',
        license_expiry_date: new Date(2030, 0, 1),
        home_address: '123 Driver Street, Cityville',
        emergency_contact_name: 'Jane Wilson',
        emergency_contact_phone: '000-000-0003',
      },
    });
    console.log('Driver profile seeded.');
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
