const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');

const generateUniqueUsername = async (name) => {
  let base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!base) base = 'user';
  let username = base;
  let count = 1;
  while (true) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) break;
    username = `${base}${count}`;
    count++;
  }
  return username;
};

const generateNextEmployeeId = async (role) => {
  let prefix = '';
  if (role === 'ADMIN') prefix = 'ADM';
  else if (role === 'OPERATIONS_MANAGER') prefix = 'OPS';
  else if (role === 'DRIVER') prefix = 'DRV';

  const users = await prisma.user.findMany({
    where: { employee_id: { startsWith: `${prefix}-` } },
    select: { employee_id: true },
  });

  let maxNum = 0;
  users.forEach((u) => {
    const match = u.employee_id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
};

const createUser = async (userBody, currentUserId, currentUserRole) => {
  const { name, username, email, phone, role, status = 'Active', password } = userBody;

  // Rule: OPERATIONS_MANAGER cannot create ADMIN accounts
  if (role === 'ADMIN' && currentUserRole === 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Operations Managers are not permitted to create Admin accounts.');
  }

  // Check unique constraints
  const existingEmail = await prisma.user.findFirst({ where: { email, is_deleted: false } });
  if (existingEmail) {
    throw new BadRequestError('Email address is already in use.');
  }

  if (username) {
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new BadRequestError('Username is already in use.');
    }
  }

  // Generate unique username if not provided
  const finalUsername = username || (await generateUniqueUsername(name));

  // Generate next unique employee ID
  const employeeId = await generateNextEmployeeId(role);

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Database Transaction
  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        username: finalUsername,
        email,
        phone,
        role,
        status,
        employee_id: employeeId,
        password_hash: passwordHash,
        created_by: currentUserId,
      },
    });

    await tx.notificationPreference.create({
      data: { user_id: user.id },
    });

    await auditService.logAction(
      currentUserId,
      'User Created',
      'USER',
      user.id,
      null,
      { id: user.id, name: user.name, email: user.email, role: user.role }
    );

    if (role === 'DRIVER') {
      const { hireDate, drivingLicenseId, commercialLicenseId, licenseExpiryDate, homeAddress, emergencyContactName, emergencyContactPhone } = userBody;

      // Check unique driving license
      const existingLicense = await tx.driverProfile.findUnique({ where: { driving_license_id: drivingLicenseId } });
      if (existingLicense) {
        throw new BadRequestError('Driving license ID is already in use.');
      }

      await tx.driverProfile.create({
        data: {
          user_id: user.id,
          hire_date: new Date(hireDate),
          driving_license_id: drivingLicenseId,
          commercial_license_id: commercialLicenseId || null,
          license_expiry_date: new Date(licenseExpiryDate),
          home_address: homeAddress,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
        },
      });
    }

    return user;
  });

  const { password_hash, ...userResponse } = createdUser;
  return userResponse;
};

const getUsers = async (queryFilters) => {
  const { page = 1, limit = 10, search = '', role, status } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  // Build filter object
  const where = {
    is_deleted: false,
  };

  if (role) {
    where.role = role;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { username: { contains: search } },
      { employee_id: { contains: search } },
    ];
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take,
      include: {
        driver_profile: {
          include: {
            documents: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  // Exclude password hashes
  const usersResponse = users.map((u) => {
    const { password_hash, ...userResponse } = u;
    return userResponse;
  });

  return {
    users: usersResponse,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getUserById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      driver_profile: {
        include: {
          documents: true,
        },
      },
    },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  const { password_hash, ...userResponse } = user;
  return userResponse;
};

const updateUser = async (id, userBody, currentUserId, currentUserRole) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  // Rule: OPERATIONS_MANAGER cannot edit ADMIN accounts
  if (user.role === 'ADMIN' && currentUserRole === 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Operations Managers are not permitted to modify Admin accounts.');
  }

  const { name, email, phone, role, status } = userBody;

  // If role updates to ADMIN but current is OPERATIONS_MANAGER
  if (role === 'ADMIN' && currentUserRole === 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Operations Managers are not permitted to promote users to Admin.');
  }

  // Check unique constraints if changing
  if (email && email !== user.email) {
    const existingEmail = await prisma.user.findFirst({ where: { email, is_deleted: false } });
    if (existingEmail) {
      throw new BadRequestError('Email address is already in use.');
    }
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        role,
        status,
        updated_by: currentUserId,
      },
    });

    // Handle nested driver updates if driver profile is present
    if (updated.role === 'DRIVER') {
      const { hireDate, drivingLicenseId, commercialLicenseId, licenseExpiryDate, homeAddress, emergencyContactName, emergencyContactPhone } = userBody;

      // Update or create driver profile if it didn't exist before (promoting to driver)
      const existingProfile = await tx.driverProfile.findUnique({ where: { user_id: id } });

      if (existingProfile) {
        if (drivingLicenseId && drivingLicenseId !== existingProfile.driving_license_id) {
          const checkLicense = await tx.driverProfile.findUnique({ where: { driving_license_id: drivingLicenseId } });
          if (checkLicense) {
            throw new BadRequestError('Driving license ID is already in use.');
          }
        }

        await tx.driverProfile.update({
          where: { user_id: id },
          data: {
            hire_date: hireDate ? new Date(hireDate) : undefined,
            driving_license_id: drivingLicenseId,
            commercial_license_id: commercialLicenseId,
            license_expiry_date: licenseExpiryDate ? new Date(licenseExpiryDate) : undefined,
            home_address: homeAddress,
            emergency_contact_name: emergencyContactName,
            emergency_contact_phone: emergencyContactPhone,
          },
        });
      } else {
        // If promoting to driver from OPS or ADMIN
        if (hireDate && drivingLicenseId && licenseExpiryDate && homeAddress && emergencyContactName && emergencyContactPhone) {
          await tx.driverProfile.create({
            data: {
              user_id: id,
              hire_date: new Date(hireDate),
              driving_license_id: drivingLicenseId,
              commercial_license_id: commercialLicenseId || null,
              license_expiry_date: new Date(licenseExpiryDate),
              home_address: homeAddress,
              emergency_contact_name: emergencyContactName,
              emergency_contact_phone: emergencyContactPhone,
            },
          });
        }
      }
    }

    return updated;
  });

  const { password_hash, ...userResponse } = updatedUser;
  return userResponse;
};

const updateUserStatus = async (id, status, currentUserId, currentUserRole) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  // Rule: OPERATIONS_MANAGER cannot disable/change ADMIN status
  if (user.role === 'ADMIN' && currentUserRole === 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Operations Managers are not permitted to change Admin account status.');
  }

  const oldStatus = user.status;
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status,
      updated_by: currentUserId,
    },
  });

  await auditService.logAction(
    currentUserId,
    'User Status Changed',
    'USER',
    id,
    oldStatus,
    status
  );

  const { password_hash, ...userResponse } = updated;
  return userResponse;
};

const softDeleteUser = async (id, currentUserId, currentUserRole) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  // Rule: OPERATIONS_MANAGER cannot delete ADMIN accounts
  if (user.role === 'ADMIN' && currentUserRole === 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Operations Managers are not permitted to delete Admin accounts.');
  }

  await prisma.user.update({
    where: { id },
    data: {
      is_deleted: true,
      updated_by: currentUserId,
    },
  });
};

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  softDeleteUser,
};
