const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');
const notificationService = require('./notification');
const settingService = require('./setting');

const generateReturnNumber = async () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `RET-${year}-${randomSuffix}`;
};

const assertDriverReturnAccess = async (returnRecord, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile || returnRecord.driver_id !== driverProfile.id) {
      throw new ForbiddenError('You only have permission to view your assigned returns.');
    }
  }
};

const createReturn = async (returnBody, currentUserId, currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Only Admins and Operations Managers can schedule returns.');
  }

  const { bookingId, driverId, scheduledReturnDate } = returnBody;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  // Must validate booking status
  if (booking.status !== 'Vehicle_Delivered' && booking.status !== 'Active_Rental') {
    throw new BadRequestError('Cannot schedule return. Booking status must be Vehicle_Delivered or Active_Rental.');
  }

  // Must validate vehicle status
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: booking.vehicle_id },
  });

  if (!vehicle || vehicle.status !== 'In_Trip') {
    throw new BadRequestError(`Cannot schedule return. Vehicle status is currently: ${vehicle ? vehicle.status : 'Unknown'}. Must be In_Trip.`);
  }

  const driver = await prisma.driverProfile.findUnique({
    where: { id: driverId },
  });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  const returnNumber = await generateReturnNumber();

  const returnRecord = await prisma.$transaction(async (tx) => {
    // 1. Create Return
    const newReturn = await tx.vehicleReturn.create({
      data: {
        return_number: returnNumber,
        booking_id: bookingId,
        vehicle_id: booking.vehicle_id,
        driver_id: driverId,
        customer_id: booking.customer_id,
        scheduled_return_date: new Date(scheduledReturnDate),
        status: 'Scheduled',
      },
    });

    // 2. Log status history
    await tx.returnStatusHistory.create({
      data: {
        return_id: newReturn.id,
        old_status: 'Scheduled',
        new_status: 'Scheduled',
        changed_by: currentUserId,
        notes: 'Vehicle return scheduled.',
      },
    });

    // 3. Update booking status
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'Return_Scheduled' },
    });

    await tx.bookingStatusHistory.create({
      data: {
        booking_id: bookingId,
        old_status: booking.status,
        new_status: 'Return_Scheduled',
        changed_by: currentUserId,
        notes: 'Vehicle return scheduled.',
      },
    });

    return newReturn;
  });

  await notificationService.createNotification({
    title: 'Return Scheduled',
    message: `Return ${returnRecord.return_number} has been scheduled.`,
    type: 'RETURN',
    priority: 'MEDIUM',
    creatorId: currentUserId,
    specificUserIds: [driver.user_id],
  });

  return returnRecord;
};

const getReturns = async (queryFilters, currentUserId, currentUserRole) => {
  const { page = 1, limit = 10, search = '', status, bookingId, driverId, vehicleId } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = {};

  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile) {
      return { returns: [], pagination: { total: 0, page: 1, limit: take, totalPages: 0 } };
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
      { return_number: { contains: search } },
      { notes: { contains: search } },
    ];
  }

  const [returns, total] = await prisma.$transaction([
    prisma.vehicleReturn.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        booking: true,
        vehicle: true,
        driver: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        customer: true,
        inspections: true,
        photos: true,
        charges: {
          include: {
            approver: { select: { name: true } },
          },
        },
        status_histories: {
          include: {
            user: { select: { name: true, role: true } },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    }),
    prisma.vehicleReturn.count({ where }),
  ]);

  return {
    returns,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getReturnById = async (id, currentUserId, currentUserRole) => {
  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id },
    include: {
      booking: true,
      vehicle: true,
      driver: {
        include: {
          user: { select: { name: true, phone: true } },
        },
      },
      customer: true,
      inspections: true,
      photos: true,
      charges: {
        include: {
          approver: { select: { name: true } },
        },
      },
      status_histories: {
        include: {
          user: { select: { name: true, role: true } },
        },
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  return returnRecord;
};

const addInspection = async (returnId, inspectionBody, currentUserId, currentUserRole) => {
  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id: returnId },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  const { odometerIn, fuelLevelIn, vehicleCondition, damageNotes } = inspectionBody;

  // Retrieve delivery inspection values for auto charge calculations
  const delivery = await prisma.delivery.findFirst({
    where: { booking_id: returnRecord.booking_id },
    include: { inspections: true },
  });

  const booking = await prisma.booking.findUnique({
    where: { id: returnRecord.booking_id },
  });

  const inspection = await prisma.$transaction(async (tx) => {
    // 1. Create Return Inspection record
    const newInspection = await tx.returnInspection.create({
      data: {
        return_id: returnId,
        odometer_in: odometerIn,
        fuel_level_in: fuelLevelIn,
        vehicle_condition: vehicleCondition,
        damage_notes: damageNotes || null,
      },
    });

    // Auto Charge Engine
    let damageChargeCreated = false;

    // Fetch dynamic rates from system settings
    const mileageRate = await settingService.getSettingWithFallback('mileage_charge_rate', 0.25);
    const fuelRate = await settingService.getSettingWithFallback('fuel_charge_rate', 2.00);
    const lateFee = await settingService.getSettingWithFallback('late_return_fee', 50.00);

    if (delivery && delivery.inspections.length > 0) {
      const delInspection = delivery.inspections[0];

      // Odometer/Mileage Charge
      if (odometerIn > delInspection.odometer_out) {
        const extraMiles = odometerIn - delInspection.odometer_out;
        const mileageCharge = Number((extraMiles * mileageRate).toFixed(2));
        await tx.returnCharge.create({
          data: {
            return_id: returnId,
            charge_type: 'Mileage Charge',
            amount: mileageCharge,
            notes: `Mileage excess of ${extraMiles} miles (Odometer Out: ${delInspection.odometer_out}, In: ${odometerIn}) charged at $${mileageRate}/mile.`,
          },
        });
      }

      // Fuel Charge
      if (Number(fuelLevelIn) < Number(delInspection.fuel_level_out)) {
        const missingFuelPercent = Number(delInspection.fuel_level_out) - Number(fuelLevelIn);
        const fuelCharge = Number((missingFuelPercent * fuelRate).toFixed(2));
        await tx.returnCharge.create({
          data: {
            return_id: returnId,
            charge_type: 'Fuel Charge',
            amount: fuelCharge,
            notes: `Fuel missing: ${missingFuelPercent.toFixed(2)}% (Fuel Out: ${delInspection.fuel_level_out}%, In: ${fuelLevelIn}%) charged at $${fuelRate} per 1%.`,
          },
        });
      }
    }

    // Damage Charge
    if (damageNotes && damageNotes.trim().length > 0) {
      damageChargeCreated = true;
      await tx.returnCharge.create({
        data: {
          return_id: returnId,
          charge_type: 'Damage Charge',
          amount: 150.00,
          notes: `Vehicle damage reported: "${damageNotes}". Pending Admin approval.`,
          damage_charge_status: 'Pending',
        },
      });

      // Notify that damage has been reported
      await notificationService.createNotification({
        title: 'Damage Reported',
        message: `Vehicle damage reported on return ${returnRecord.return_number}: "${damageNotes}".`,
        type: 'RETURN',
        priority: 'HIGH',
        creatorId: currentUserId,
      });
    }

    // Late Return Charge
    if (booking) {
      const scheduledReturnTime = new Date(booking.return_date).getTime();
      const actualReturnTime = Date.now();
      if (actualReturnTime > scheduledReturnTime) {
        const diffMs = actualReturnTime - scheduledReturnTime;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          const lateCharge = diffDays * lateFee;
          await tx.returnCharge.create({
            data: {
              return_id: returnId,
              charge_type: 'Late Return Charge',
              amount: lateCharge,
              notes: `Late return by ${diffDays} day(s) charged at $${lateFee}/day.`,
            },
          });
        }
      }
    }

    // Update Return Status
    const nextStatus = damageChargeCreated ? 'Charges_Pending' : 'Inspection_Completed';
    await tx.vehicleReturn.update({
      where: { id: returnId },
      data: { status: nextStatus },
    });

    await tx.returnStatusHistory.create({
      data: {
        return_id: returnId,
        old_status: returnRecord.status,
        new_status: nextStatus,
        changed_by: currentUserId,
        notes: `Handover inspection recorded. Next status: ${nextStatus}.`,
      },
    });

    return newInspection;
  });

  return inspection;
};

const addPhoto = async (returnId, photoBody, currentUserId, currentUserRole) => {
  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id: returnId },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  const { photoType, fileUrl } = photoBody;

  const photo = await prisma.returnPhoto.create({
    data: {
      return_id: returnId,
      photo_type: photoType,
      file_url: fileUrl,
    },
  });

  return photo;
};

const captureSignatures = async (returnId, signatureBody, currentUserId, currentUserRole) => {
  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id: returnId },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  const { customerSignature, driverSignature } = signatureBody;

  const updated = await prisma.vehicleReturn.update({
    where: { id: returnId },
    data: {
      customer_signature: customerSignature,
      driver_signature: driverSignature,
      actual_return_date: new Date(),
    },
  });

  return updated;
};

const approveDamageCharge = async (returnId, chargeId, approvalBody, currentUserId, currentUserRole) => {
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Administrators are allowed to approve or waive damage charges.');
  }

  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id: returnId },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  const charge = await prisma.returnCharge.findUnique({
    where: { id: chargeId },
  });

  if (!charge || charge.return_id !== returnId || charge.charge_type !== 'Damage Charge') {
    throw new NotFoundError('Pending damage charge not found.');
  }

  const { status } = approvalBody;

  const updatedCharge = await prisma.$transaction(async (tx) => {
    const updated = await tx.returnCharge.update({
      where: { id: chargeId },
      data: {
        damage_charge_status: status,
        approved_by: currentUserId,
        approved_at: new Date(),
      },
    });

    // Check if there are other pending damage charges for this return
    const pendingCharges = await tx.returnCharge.findMany({
      where: {
        return_id: returnId,
        damage_charge_status: 'Pending',
      },
    });

    // If no more pending charges, we can transition from Charges_Pending to Inspection_Completed
    if (pendingCharges.length === 0 && returnRecord.status === 'Charges_Pending') {
      await tx.vehicleReturn.update({
        where: { id: returnId },
        data: { status: 'Inspection_Completed' },
      });

      await tx.returnStatusHistory.create({
        data: {
          return_id: returnId,
          old_status: 'Charges_Pending',
          new_status: 'Inspection_Completed',
          changed_by: currentUserId,
          notes: 'All damage charges resolved. Status transitioned to Inspection_Completed.',
        },
      });
    }

    return updated;
  });

  return updatedCharge;
};

const getReturnSummary = async (id, currentUserId, currentUserRole) => {
  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id },
    include: {
      booking: true,
      charges: true,
    },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  const baseRental = Number(returnRecord.booking.total_amount);

  let mileageCharges = 0;
  let fuelCharges = 0;
  let damageCharges = 0;
  let lateCharges = 0;

  for (const c of returnRecord.charges) {
    const amt = Number(c.amount);
    if (c.charge_type === 'Mileage Charge') {
      mileageCharges += amt;
    } else if (c.charge_type === 'Fuel Charge') {
      fuelCharges += amt;
    } else if (c.charge_type === 'Damage Charge') {
      if (c.damage_charge_status === 'Approved') {
        damageCharges += amt;
      }
    } else if (c.charge_type === 'Late Return Charge') {
      lateCharges += amt;
    }
  }

  const totalAdditional = mileageCharges + fuelCharges + damageCharges + lateCharges;
  const grandTotal = baseRental + totalAdditional;

  return {
    baseRentalAmount: baseRental,
    mileageCharges,
    fuelCharges,
    damageCharges,
    lateCharges,
    totalAdditionalCharges: totalAdditional,
    grandTotal,
  };
};

const updateReturnStatus = async (id, statusBody, currentUserId, currentUserRole) => {
  const { status, notes } = statusBody;

  const returnRecord = await prisma.vehicleReturn.findUnique({
    where: { id },
    include: {
      inspections: true,
      photos: true,
    },
  });

  if (!returnRecord) {
    throw new NotFoundError('Return record not found.');
  }

  await assertDriverReturnAccess(returnRecord, currentUserId, currentUserRole);

  const oldStatus = returnRecord.status;

  // Complete checks
  if (status === 'Completed') {
    if (returnRecord.inspections.length === 0) {
      throw new BadRequestError('Return cannot be completed. No inspection is recorded.');
    }
    if (returnRecord.photos.length === 0) {
      throw new BadRequestError('Return cannot be completed. No photo record is uploaded.');
    }
    if (!returnRecord.customer_signature || !returnRecord.driver_signature) {
      throw new BadRequestError('Return cannot be completed. Handover signatures are missing.');
    }
  }

  const updatedReturn = await prisma.$transaction(async (tx) => {
    // 1. Update Return
    const updated = await tx.vehicleReturn.update({
      where: { id },
      data: { status },
    });

    // 2. Log Status History
    await tx.returnStatusHistory.create({
      data: {
        return_id: id,
        old_status: oldStatus,
        new_status: status,
        changed_by: currentUserId,
        notes: notes || `Return status updated from ${oldStatus} to ${status}.`,
      },
    });

    // 3. Cascade booking return logic on Completed
    if (status === 'Completed') {
      const booking = await tx.booking.findUnique({
        where: { id: returnRecord.booking_id },
      });

      if (booking) {
        // Log booking intermediate Vehicle_Returned
        await tx.bookingStatusHistory.create({
          data: {
            booking_id: booking.id,
            old_status: booking.status,
            new_status: 'Vehicle_Returned',
            changed_by: currentUserId,
            notes: 'Vehicle returned at terminal. Completed final inspection check.',
          },
        });

        // Log booking final Completed status
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'Completed' },
        });

        await tx.bookingStatusHistory.create({
          data: {
            booking_id: booking.id,
            old_status: 'Vehicle_Returned',
            new_status: 'Completed',
            changed_by: currentUserId,
            notes: 'Rental booking successfully closed.',
          },
        });

        // Update Vehicle Available status
        await tx.vehicle.update({
          where: { id: booking.vehicle_id },
          data: { status: 'Available' },
        });

        // Update Driver status to Available
        if (booking.assigned_driver_id) {
          await tx.driverProfile.update({
            where: { id: booking.assigned_driver_id },
            data: {
              availability: 'Available',
              current_booking_id: null,
            },
          });
        }
      }
    }

    return updated;
  });

  await auditService.logAction(
    currentUserId,
    'Return Status Updated',
    'RETURN',
    id,
    oldStatus,
    status
  );

  if (status === 'Completed') {
    await auditService.logAction(
      currentUserId,
      'Return Completed',
      'RETURN',
      id,
      oldStatus,
      'Completed'
    );

    await notificationService.createNotification({
      title: 'Return Completed',
      message: `Return ${returnRecord.return_number} has been completed successfully.`,
      type: 'RETURN',
      priority: 'HIGH',
      creatorId: currentUserId,
    });
  }

  return updatedReturn;
};

module.exports = {
  createReturn,
  getReturns,
  getReturnById,
  addInspection,
  addPhoto,
  captureSignatures,
  approveDamageCharge,
  getReturnSummary,
  updateReturnStatus,
};
