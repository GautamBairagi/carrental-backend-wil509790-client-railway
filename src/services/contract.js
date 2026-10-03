const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');
const notificationService = require('./notification');

const generateContractNumber = async () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `CON-${year}-${randomSuffix}`;
};

const getNextVersion = async (bookingId) => {
  const latest = await prisma.contract.findFirst({
    where: { booking_id: bookingId },
    orderBy: { created_at: 'desc' },
  });

  if (!latest) return 'v1.0';

  const match = latest.contract_version.match(/^v(\d+)\.(\d+)$/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return `v${major}.${minor + 1}`;
  }
  return 'v1.0';
};

const assertDriverContractAccess = async (contract, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    const booking = await prisma.booking.findUnique({ where: { id: contract.booking_id } });
    if (!driverProfile || !booking || booking.assigned_driver_id !== driverProfile.id) {
      throw new ForbiddenError('You only have permission to view contracts for your assigned bookings.');
    }
  }
};

const createContract = async (contractBody, currentUserId) => {
  const { bookingId, contractContent } = contractBody;

  // Retrieve booking context
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Parent booking not found.');
  }

  const contractNumber = await generateContractNumber();
  const nextVersion = await getNextVersion(bookingId);

  const contract = await prisma.$transaction(async (tx) => {
    const newContract = await tx.contract.create({
      data: {
        contract_number: contractNumber,
        booking_id: bookingId,
        customer_id: booking.customer_id,
        vehicle_id: booking.vehicle_id,
        contract_version: nextVersion,
        contract_content: contractContent,
        status: 'Draft',
      },
    });

    await tx.contractHistory.create({
      data: {
        contract_id: newContract.id,
        old_status: 'Draft',
        new_status: 'Draft',
        changed_by: currentUserId,
        notes: `Contract draft created at version ${nextVersion}.`,
      },
    });

    return newContract;
  });

  return contract;
};

const getContracts = async (queryFilters, currentUserId, currentUserRole) => {
  const { page = 1, limit = 10, bookingId, customerId } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = {};

  // Driver role filter restrictions
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile) {
      return { contracts: [], pagination: { total: 0, page: 1, limit: take, totalPages: 0 } };
    }
    where.booking = { assigned_driver_id: driverProfile.id };
  }

  if (bookingId) {
    where.booking_id = bookingId;
  }

  if (customerId) {
    where.customer_id = customerId;
  }

  const [contracts, total] = await prisma.$transaction([
    prisma.contract.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
    }),
    prisma.contract.count({ where }),
  ]);

  return {
    contracts,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getContractById = async (id, currentUserId, currentUserRole) => {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { histories: true },
  });

  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  await assertDriverContractAccess(contract, currentUserId, currentUserRole);

  return contract;
};

const getContractByBookingId = async (bookingId, currentUserId, currentUserRole) => {
  // Retrieve the latest contract version for a booking
  const contract = await prisma.contract.findFirst({
    where: { booking_id: bookingId },
    orderBy: { created_at: 'desc' },
    include: { histories: true },
  });

  if (!contract) {
    throw new NotFoundError('No contracts found for this booking.');
  }

  await assertDriverContractAccess(contract, currentUserId, currentUserRole);

  return contract;
};

const sendContract = async (id, notes, currentUserId) => {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  const oldStatus = contract.status;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id },
      data: { status: 'Sent' },
    });

    await tx.contractHistory.create({
      data: {
        contract_id: id,
        old_status: oldStatus,
        new_status: 'Sent',
        changed_by: currentUserId,
        notes: notes || 'Contract sent to customer.',
      },
    });

    // Cascade parent booking status
    await tx.booking.update({
      where: { id: contract.booking_id },
      data: { status: 'Contract_Sent' },
    });

    await tx.bookingStatusHistory.create({
      data: {
        booking_id: contract.booking_id,
        old_status: 'License_Verified', // default prior flow step
        new_status: 'Contract_Sent',
        changed_by: currentUserId,
        notes: 'Booking status updated to Contract Sent.',
      },
    });

    return updatedContract;
  });

  await notificationService.createNotification({
    title: 'Contract Sent',
    message: `Contract ${contract.contract_number} has been sent to customer.`,
    type: 'CONTRACT',
    priority: 'LOW',
    creatorId: currentUserId,
  });

  return updated;
};

const viewContract = async (id, currentUserId) => {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  const oldStatus = contract.status;

  // Viewed updates must trigger status shift only from Sent state
  if (oldStatus !== 'Sent') {
    return contract;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const dataUpdate = { status: 'Viewed' };

    // Prevent overwriting first viewed timestamp
    if (!contract.viewed_at) {
      dataUpdate.viewed_at = new Date();
    }

    const updatedContract = await tx.contract.update({
      where: { id },
      data: dataUpdate,
    });

    await tx.contractHistory.create({
      data: {
        contract_id: id,
        old_status: oldStatus,
        new_status: 'Viewed',
        changed_by: currentUserId,
        notes: 'Contract viewed by customer.',
      },
    });

    return updatedContract;
  });

  return updated;
};

const signContract = async (id, signBody, currentUserId) => {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  if (contract.signed) {
    // Sync existing out-of-sync bookings (backward compatibility)
    const booking = await prisma.booking.findUnique({ where: { id: contract.booking_id } });
    if (!booking.contract_signed || booking.status !== 'Contract_Signed') {
       await prisma.booking.update({
         where: { id: contract.booking_id },
         data: {
           contract_signed: true,
           status: 'Contract_Signed'
         }
       });
       return contract;
    }
    throw new BadRequestError('Contract has already been signed.');
  }

  const { signatureType, typedSignature, signatureImage, ipAddress, pdfUrl } = signBody;
  const oldStatus = contract.status;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id },
      data: {
        status: 'Signed',
        signed: true,
        signed_at: new Date(),
        signature_type: signatureType,
        typed_signature: signatureType === 'TYPE' ? typedSignature : null,
        signature_image: signatureType === 'DRAW' ? signatureImage : null,
        ip_address: ipAddress,
        pdf_url: pdfUrl || null,
      },
    });

    await tx.contractHistory.create({
      data: {
        contract_id: id,
        old_status: oldStatus,
        new_status: 'Signed',
        changed_by: currentUserId,
        notes: `Contract signed via ${signatureType} by customer at IP ${ipAddress}.`,
      },
    });

    // Parent booking cascade updates
    await tx.booking.update({
      where: { id: contract.booking_id },
      data: {
        contract_signed: true,
        status: 'Contract_Signed',
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        booking_id: contract.booking_id,
        old_status: 'Contract_Sent',
        new_status: 'Contract_Signed',
        changed_by: currentUserId,
        notes: 'Contract executed. Booking marked as Contract Signed.',
      },
    });

    return updatedContract;
  });

  await auditService.logAction(
    currentUserId,
    'Contract Signed',
    'CONTRACT',
    id,
    oldStatus,
    'Signed'
  );

  await notificationService.createNotification({
    title: 'Contract Signed',
    message: `Contract ${contract.contract_number} has been signed.`,
    type: 'CONTRACT',
    priority: 'HIGH',
    creatorId: currentUserId,
  });

  return updated;
};

const rejectContract = async (id, notes, currentUserId) => {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  const oldStatus = contract.status;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id },
      data: { status: 'Rejected' },
    });

    await tx.contractHistory.create({
      data: {
        contract_id: id,
        old_status: oldStatus,
        new_status: 'Rejected',
        changed_by: currentUserId,
        notes: notes || 'Contract rejected by customer.',
      },
    });

    return updatedContract;
  });

  await notificationService.createNotification({
    title: 'Contract Rejected',
    message: `Contract ${contract.contract_number} has been rejected.`,
    type: 'CONTRACT',
    priority: 'HIGH',
    creatorId: currentUserId,
  });

  return updated;
};

const expireContract = async (id, notes, currentUserId) => {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    throw new NotFoundError('Contract not found.');
  }

  const oldStatus = contract.status;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id },
      data: { status: 'Expired' },
    });

    await tx.contractHistory.create({
      data: {
        contract_id: id,
        old_status: oldStatus,
        new_status: 'Expired',
        changed_by: currentUserId,
        notes: notes || 'Contract expired.',
      },
    });

    return updatedContract;
  });

  return updated;
};

module.exports = {
  createContract,
  getContracts,
  getContractById,
  getContractByBookingId,
  sendContract,
  viewContract,
  signContract,
  rejectContract,
  expireContract,
};
