const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!admin) {
    console.log('Admin user not found!');
    return;
  }

  console.log(`Current Admin Email in Database: ${admin.email}`);

  // Reset password back to default
  const newPassword = 'AdminPass123!';
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: admin.id },
    data: { password_hash: hashedPassword }
  });

  console.log(`Password has been successfully reset to: ${newPassword}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
