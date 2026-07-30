const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const notificationService = require('./notification');

const generateDeliveryNumber = async () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `DLV-${year}-${randomSuffix}`;
};

const assertDriverDeliveryAccess = async (delivery, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile || delivery.driver_id !== driverProfile.id) {
      throw new ForbiddenError('You only have permission to access your assigned deliveries.');
    }
  }
};

const createDelivery = async (deliveryBody, currentUserId, currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Only Admins and Operations Managers can schedule deliveries.');
  }

  const { bookingId, driverId, scheduledDate, notes } = deliveryBody;

  // Retrieve booking context
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  // Check contract and payment integration rules
  if (!booking.contract_signed) {
    throw new BadRequestError('Cannot create delivery. The contract for this booking has not been signed.');
  }

  if (!booking.payment_completed) {
    throw new BadRequestError('Cannot create delivery. The payment for this booking has not been completed.');
  }

  // Retrieve driver profile
  const driver = await prisma.driverProfile.findUnique({
    where: { id: driverId },
  });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  // Retrieve customer context to get fallback address
  const customer = await prisma.customer.findUnique({
    where: { id: booking.customer_id },
  });

  const deliveryAddress = booking.delivery_address || (customer ? customer.address : null) || booking.pickup_location;
  const pickupAddress = booking.pickup_location;

  const deliveryNumber = await generateDeliveryNumber();

  const delivery = await prisma.$transaction(async (tx) => {
    // 1. Create delivery record
    const newDelivery = await tx.delivery.create({
      data: {
        delivery_number: deliveryNumber,
        booking_id: bookingId,
        vehicle_id: booking.vehicle_id,
        driver_id: driverId,
        customer_id: booking.customer_id,
        scheduled_date: new Date(scheduledDate),
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        status: 'Assigned',
        notes: notes || null,
      },
    });

    // 2. Initialize status history
    await tx.deliveryStatusHistory.create({
      data: {
        delivery_id: newDelivery.id,
        old_status: 'Pending',
        new_status: 'Assigned',
        changed_by: currentUserId,
        notes: 'Delivery scheduled and driver assigned.',
      },
    });

    // 3. Create default checklist items
    const checklistItems = [
      'Vehicle Cleaned',
      'Fuel Verified',
      'Registration Present',
      'Insurance Copy Present',
      'Spare Tire Present',
      'Keys Handed Over',
      'Customer ID Verified'
    ];

    await tx.deliveryChecklist.createMany({
      data: checklistItems.map((item) => ({
        delivery_id: newDelivery.id,
        item_name: item,
        completed: false,
      })),
    });

    // 4. Update booking status to Delivery_Scheduled
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'Delivery_Scheduled',
        assigned_driver_id: driverId, // sync driver to booking as well
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        booking_id: bookingId,
        old_status: booking.status,
        new_status: 'Delivery_Scheduled',
        changed_by: currentUserId,
        notes: 'Delivery scheduled.',
      },
    });

    return newDelivery;
  });

  await notificationService.createNotification({
    title: 'Delivery Scheduled',
    message: `Delivery ${delivery.delivery_number} has been scheduled.`,
    type: 'DELIVERY',
    priority: 'MEDIUM',
    creatorId: currentUserId,
    specificUserIds: [driver.user_id],
  });

  return delivery;
};

const getDeliveries = async (queryFilters, currentUserId, currentUserRole) => {
  const { page = 1, limit = 10, search = '', status, bookingId, driverId, vehicleId } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = {};

  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile) {
      return { deliveries: [], pagination: { total: 0, page: 1, limit: take, totalPages: 0 } };
    }
    where.driver_id = driverProfile.id;
  } else {
    if (driverId) {
      where.driver_id = driverId;
    }
  }

  if (status) {
    where.status = status;
  }

  if (bookingId) {
    where.booking_id = bookingId;
  }

  if (vehicleId) {
    where.vehicle_id = vehicleId;
  }

  if (search) {
    where.OR = [
      { delivery_number: { contains: search } },
      { pickup_address: { contains: search } },
      { delivery_address: { contains: search } },
    ];
  }

  const [deliveries, total] = await prisma.$transaction([
    prisma.delivery.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        booking: true,
        vehicle: true,
        driver: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
        customer: true,
        inspections: true,
        photos: true,
        status_histories: {
          include: {
            user: { select: { name: true, role: true } },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    }),
    prisma.delivery.count({ where }),
  ]);

  return {
    deliveries,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getDeliveryById = async (id, currentUserId, currentUserRole) => {
  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: {
      booking: true,
      vehicle: true,
      driver: {
        include: {
          user: {
            select: { name: true, phone: true },
          },
        },
      },
      customer: true,
      status_histories: {
        include: {
          user: { select: { name: true, role: true } },
        },
        orderBy: { created_at: 'desc' },
      },
      inspections: true,
      photos: true,
      checklist_items: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  return delivery;
};

const updateDeliveryStatus = async (id, statusBody, currentUserId, currentUserRole) => {
  const { status, notes } = statusBody;

  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: {
      checklist_items: true,
    },
  });

  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  const oldStatus = delivery.status;

  // If status transitions to Delivered, perform additional checks
  if (status === 'Delivered') {
    if (!delivery.customer_signature || !delivery.driver_signature || !delivery.handover_time) {
      throw new BadRequestError('Delivery cannot be marked Delivered unless signatures and handover time are captured.');
    }

    const uncompleted = delivery.checklist_items.filter((item) => !item.completed);
    if (uncompleted.length > 0) {
      throw new BadRequestError(`Delivery cannot be marked Delivered unless all checklist items are completed. Pending items: ${uncompleted.map(i => i.item_name).join(', ')}`);
    }
  }

  const updatedDelivery = await prisma.$transaction(async (tx) => {
    // 1. Update status
    const updateData = {
      status,
      actual_delivery_time: status === 'Delivered' ? new Date() : undefined,
    };

    const updated = await tx.delivery.update({
      where: { id },
      data: updateData,
    });

    // 2. Log status history
    await tx.deliveryStatusHistory.create({
      data: {
        delivery_id: id,
        old_status: oldStatus,
        new_status: status,
        changed_by: currentUserId,
        notes: notes || `Delivery status changed from ${oldStatus} to ${status}.`,
      },
    });

    // 3. Integrate with Booking if status becomes Delivered
    if (status === 'Delivered') {
      const booking = await tx.booking.findUnique({
        where: { id: delivery.booking_id },
      });

      if (booking) {
        await tx.booking.update({
          where: { id: delivery.booking_id },
          data: { status: 'Vehicle_Delivered' },
        });

        await tx.bookingStatusHistory.create({
          data: {
            booking_id: delivery.booking_id,
            old_status: booking.status,
            new_status: 'Vehicle_Delivered',
            changed_by: currentUserId,
            notes: 'Delivery completed. Vehicle successfully delivered to customer.',
          },
        });

        // Update Vehicle status to In_Trip
        await tx.vehicle.update({
          where: { id: booking.vehicle_id },
          data: { status: 'In_Trip' },
        });
      }
    }

    return updated;
  });

  if (status === 'Delivered') {
    await notificationService.createNotification({
      title: 'Delivery Completed',
      message: `Delivery ${delivery.delivery_number} has been successfully completed.`,
      type: 'DELIVERY',
      priority: 'HIGH',
      creatorId: currentUserId,
    });
  } else if (status === 'Failed') {
    await notificationService.createNotification({
      title: 'Delivery Failed',
      message: `Delivery ${delivery.delivery_number} has failed.`,
      type: 'DELIVERY',
      priority: 'CRITICAL',
      creatorId: currentUserId,
    });
  }

  return updatedDelivery;
};

const addInspection = async (deliveryId, inspectionBody, currentUserId, currentUserRole) => {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  const { fuelLevel, mileage, vehicleCondition, damageNotes, odometerOut, fuelLevelOut } = inspectionBody;

  const inspection = await prisma.deliveryInspection.create({
    data: {
      delivery_id: deliveryId,
      fuel_level: fuelLevel,
      mileage: mileage,
      vehicle_condition: vehicleCondition,
      damage_notes: damageNotes || null,
      odometer_out: odometerOut,
      fuel_level_out: fuelLevelOut,
    },
  });

  return inspection;
};

const addPhoto = async (deliveryId, photoBody, currentUserId, currentUserRole) => {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  const { photoType, fileUrl } = photoBody;

  const photo = await prisma.deliveryPhoto.create({
    data: {
      delivery_id: deliveryId,
      photo_type: photoType,
      file_url: fileUrl,
    },
  });

  return photo;
};

const captureSignatures = async (deliveryId, signatureBody, currentUserId, currentUserRole) => {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  const { customerSignature, driverSignature, handoverTime } = signatureBody;

  const updated = await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      customer_signature: customerSignature,
      driver_signature: driverSignature,
      handover_time: handoverTime ? new Date(handoverTime) : new Date(),
    },
  });

  return updated;
};

const updateChecklistItem = async (deliveryId, itemId, completedBody, currentUserId, currentUserRole) => {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    throw new NotFoundError('Delivery not found.');
  }

  await assertDriverDeliveryAccess(delivery, currentUserId, currentUserRole);

  const { completed } = completedBody;

  const item = await prisma.deliveryChecklist.findUnique({
    where: { id: itemId },
  });

  if (!item || item.delivery_id !== deliveryId) {
    throw new NotFoundError('Checklist item not found for this delivery.');
  }

  const updated = await prisma.deliveryChecklist.update({
    where: { id: itemId },
    data: {
      completed,
      completed_at: completed ? new Date() : null,
      completed_by: completed ? currentUserId : null,
    },
  });

  return updated;
};

module.exports = {
  createDelivery,
  getDeliveries,
  getDeliveryById,
  updateDeliveryStatus,
  addInspection,
  addPhoto,
  captureSignatures,
  updateChecklistItem,
};
