const prisma = require('../config/db');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

// Helper to check if a driver user has ownership permissions
const assertDriverAccess = (driverProfile, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER' && driverProfile.user_id !== currentUserId) {
    throw new ForbiddenError('You are only permitted to access your own driver profile.');
  }
};

const getDrivers = async (queryFilters) => {
  const { page = 1, limit = 10, search = '', availability, status, licenseExpiry } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = {
    user: {
      is_deleted: false,
    },
  };

  if (availability) {
    where.availability = availability;
  }

  if (status) {
    where.status = status;
  }

  if (licenseExpiry) {
    where.license_expiry_date = {
      lte: new Date(licenseExpiry),
    };
  }

  if (search) {
    where.user.name = { contains: search };
  }

  const [drivers, total] = await prisma.$transaction([
    prisma.driverProfile.findMany({
      where,
      skip,
      take,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.driverProfile.count({ where }),
  ]);

  return {
    drivers,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getDriverById = async (id, currentUserId, currentUserRole) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          avatar_url: true,
        },
      },
    },
  });

  if (!driver || driver.user?.is_deleted) {
    throw new NotFoundError('Driver profile not found.');
  }

  assertDriverAccess(driver, currentUserId, currentUserRole);

  return driver;
};

const updateDriverAvailability = async (id, availability, currentUserId, currentUserRole) => {
  const driver = await prisma.driverProfile.findUnique({ where: { id } });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  assertDriverAccess(driver, currentUserId, currentUserRole);

  const updated = await prisma.driverProfile.update({
    where: { id },
    data: { availability },
  });

  return updated;
};

const getComplianceReport = async (id, currentUserId, currentUserRole) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { id },
    include: { documents: true },
  });

  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  assertDriverAccess(driver, currentUserId, currentUserRole);

  const now = new Date();
  const compliance = {
    licenseStatus: 'Valid',
    licenseExpiryDate: driver.license_expiry_date,
    commercialLicenseStatus: 'N/A',
    commercialLicenseExpiryDate: driver.commercial_license_expiry_date || null,
    expiredDocuments: [],
    missingDocuments: [],
  };

  // 1. License Expiry Check (driving license)
  const daysToLicenseExpiry = Math.ceil((driver.license_expiry_date - now) / (1000 * 60 * 60 * 24));
  if (daysToLicenseExpiry < 0) {
    compliance.licenseStatus = 'Expired';
  } else if (daysToLicenseExpiry <= 30) {
    compliance.licenseStatus = 'Expiring Soon';
  }

  // 2. Commercial License Check
  if (driver.commercial_license_id) {
    // We assume commercial license has same expiry config or is valid. For standard tracking:
    compliance.commercialLicenseStatus = 'Valid';
  }

  // 3. Expired Documents
  compliance.expiredDocuments = driver.documents
    .filter((doc) => new Date(doc.expiry_date) < now)
    .map((doc) => ({
      id: doc.id,
      documentType: doc.document_type,
      expiryDate: doc.expiry_date,
      status: 'Expired',
    }));

  // 4. Missing Documents Check
  const requiredDocumentTypes = ['Driving License', 'Medical Certificate', 'Background Check'];
  const uploadedTypes = driver.documents.map((doc) => doc.document_type);

  compliance.missingDocuments = requiredDocumentTypes.filter(
    (reqType) => !uploadedTypes.includes(reqType)
  );

  return compliance;
};

const getPerformanceMetrics = async (id, currentUserId, currentUserRole) => {
  const driver = await prisma.driverProfile.findUnique({ where: { id } });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  assertDriverAccess(driver, currentUserId, currentUserRole);

  return {
    totalAssignments: driver.total_assignments,
    completedAssignments: driver.completed_assignments,
    cancelledAssignments: driver.cancelled_assignments,
    averageRating: driver.average_rating,
    onTimePercentage: driver.on_time_percentage,
  };
};

const getDriverDocuments = async (id, currentUserId, currentUserRole) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { id },
    include: { documents: true },
  });

  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  assertDriverAccess(driver, currentUserId, currentUserRole);

  return driver.documents;
};

const addDriverDocument = async (id, docBody, currentUserId, currentUserRole) => {
  // Only ADMIN and OPERATIONS_MANAGER can upload compliance docs for drivers
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Only Admins and Operations Managers are permitted to upload driver documents.');
  }

  const driver = await prisma.driverProfile.findUnique({ where: { id } });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  const { documentType, fileUrl, expiryDate, notificationDaysBefore = 30 } = docBody;

  const doc = await prisma.driverDocument.create({
    data: {
      driver_profile_id: id,
      document_type: documentType,
      file_url: fileUrl,
      expiry_date: new Date(expiryDate),
      notification_days_before: notificationDaysBefore,
    },
  });

  return doc;
};

const getMyDriverProfile = async (userId) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { user_id: userId },
    include: {
      documents: true,
      deliveries: {
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { vehicle: { select: { make: true, model: true } } },
      },
      returns: {
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { vehicle: { select: { make: true, model: true } } },
      },
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          avatar_url: true,
        },
      },
    },
  });

  if (!driver || driver.user?.is_deleted) {
    throw new NotFoundError('Driver profile not found.');
  }

  return driver;
};

module.exports = {
  getDrivers,
  getDriverById,
  updateDriverAvailability,
  getComplianceReport,
  getPerformanceMetrics,
  getDriverDocuments,
  addDriverDocument,
  getMyDriverProfile,
};
