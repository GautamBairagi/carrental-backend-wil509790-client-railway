const prisma = require('../config/db');
const stripe = require('../config/stripe');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');
const notificationService = require('./notification');

const generateBookingNumber = async () => {
  const year = new Date().getFullYear();
  // Generate random suffix to prevent predictable counts
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `GFR-${year}-${randomSuffix}`;
};

const checkOverlappingBookings = async (vehicleId, pickupDate, returnDate, excludeBookingId = null) => {
  const whereClause = {
    vehicle_id: vehicleId,
    is_deleted: false,
    status: { notIn: ['Cancelled', 'Rejected'] },
    OR: [
      {
        pickup_date: { lte: new Date(returnDate) },
        return_date: { gte: new Date(pickupDate) },
      },
    ],
  };

  if (excludeBookingId) {
    whereClause.id = { not: excludeBookingId };
  }

  const overlap = await prisma.booking.findFirst({
    where: whereClause,
  });

  return !!overlap;
};

const assertDriverBookingAccess = async (booking, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile || booking.assigned_driver_id !== driverProfile.id) {
      throw new ForbiddenError('You only have permission to view your assigned bookings.');
    }
  }
};

const createBooking = async (bookingBody, currentUserId) => {
  const {
    customerId,
    vehicleId,
    pickupDate,
    returnDate,
    pickupLocation,
    deliveryAddress,
    rentalDays,
    subtotal,
    tax,
    fees,
    totalAmount,
    paymentMethod,
    status = 'Pending_Review',
  } = bookingBody;

  // 1. Verify Customer exists
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  // 2. Verify Vehicle exists and is Available
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  if (vehicle.status === 'Out_Of_Service') {
    throw new BadRequestError(`Cannot book vehicle. Vehicle is currently out of service.`);
  }

  // 3. Prevent double booking
  const overlaps = await checkOverlappingBookings(vehicleId, pickupDate, returnDate);
  if (overlaps) {
    throw new BadRequestError('The selected vehicle is already booked during these dates.');
  }

  const bookingNumber = await generateBookingNumber();

  const booking = await prisma.$transaction(async (tx) => {
    // Create Booking
    const newBooking = await tx.booking.create({
      data: {
        booking_number: bookingNumber,
        customer_id: customerId,
        vehicle_id: vehicleId,
        pickup_date: new Date(pickupDate),
        return_date: new Date(returnDate),
        pickup_location: pickupLocation,
        delivery_address: deliveryAddress || null,
        rental_days: rentalDays,
        subtotal,
        tax,
        fees,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        status,
      },
    });

    // Update vehicle status
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'Reserved' },
    });

    // Log status history
    await tx.bookingStatusHistory.create({
      data: {
        booking_id: newBooking.id,
        old_status: 'Draft', // initial state
        new_status: status,
        changed_by: currentUserId,
        notes: 'Initial booking creation.',
      },
    });

    return newBooking;
  });

  await notificationService.createNotification({
    title: 'New Booking Created',
    message: `Booking ${booking.booking_number} has been created for customer ${customer.full_name}.`,
    type: 'BOOKING',
    priority: 'MEDIUM',
    creatorId: currentUserId,
  });

  return booking;
};

const getBookings = async (queryFilters, currentUserId, currentUserRole) => {
  const { page = 1, limit = 10, search = '', status, vehicleId, driverId, startDate, endDate } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = { is_deleted: false };

  // Role Restriction: Driver can only see their own assigned bookings
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile) {
      return { bookings: [], pagination: { total: 0, page: 1, limit: take, totalPages: 0 } };
    }
    where.assigned_driver_id = driverProfile.id;
  } else {
    // If not driver, check query filters
    if (driverId) {
      where.assigned_driver_id = driverId;
    }
  }

  if (status) {
    where.status = status;
  }

  if (vehicleId) {
    where.vehicle_id = vehicleId;
  }

  if (startDate && endDate) {
    where.pickup_date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  if (search) {
    where.OR = [
      { booking_number: { contains: search } },
      { customer: { full_name: { contains: search } } },
    ];
  }

  const [bookings, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip,
      take,
      include: {
        customer: true,
        vehicle: true,
        assigned_driver: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    bookings,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getBookingById = async (id, currentUserId, currentUserRole) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      assigned_driver: {
        include: {
          user: {
            select: { name: true, phone: true },
          },
        },
      },
      notes: {
        include: {
          user: {
            select: { name: true, role: true },
          },
        },
        orderBy: { created_at: 'desc' },
      },
      status_history: {
        include: {
          user: {
            select: { name: true, role: true },
          },
        },
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  await assertDriverBookingAccess(booking, currentUserId, currentUserRole);

  return booking;
};

const updateBooking = async (id, bookingBody, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    throw new ForbiddenError('Drivers are not permitted to modify bookings.');
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  const { pickupDate, returnDate, subtotal, tax, fees, totalAmount, paymentMethod, pickupLocation, deliveryAddress } = bookingBody;

  // Overlap verification
  if (pickupDate || returnDate) {
    const finalPickup = pickupDate || booking.pickup_date;
    const finalReturn = returnDate || booking.return_date;

    const overlap = await checkOverlappingBookings(booking.vehicle_id, finalPickup, finalReturn, id);
    if (overlap) {
      throw new BadRequestError('Overlapping booking schedule found for this vehicle.');
    }
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      pickup_date: pickupDate ? new Date(pickupDate) : undefined,
      return_date: returnDate ? new Date(returnDate) : undefined,
      subtotal,
      tax,
      fees,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      pickup_location: pickupLocation,
      delivery_address: deliveryAddress,
    },
  });

  await auditService.logAction(
    currentUserId,
    'Booking Updated',
    'BOOKING',
    id,
    booking,
    updated
  );

  return updated;
};

const updateBookingStatus = async (id, newStatus, transitionNotes, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    throw new ForbiddenError('Drivers are not permitted to update booking statuses.');
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  const oldStatus = booking.status;

  const updatedBooking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: newStatus,
        contract_signed: newStatus === 'Contract_Signed' ? true : undefined,
        payment_completed: newStatus === 'Payment_Completed' ? true : undefined,
      },
    });

    // Cascade vehicle status changes depending on booking state
    if (['Cancelled', 'Rejected', 'Completed', 'Vehicle_Returned', 'No_Show'].includes(newStatus)) {
      await tx.vehicle.update({
        where: { id: booking.vehicle_id },
        data: { status: 'Available' },
      });
    } else if (newStatus === 'Active_Rental') {
      await tx.vehicle.update({
        where: { id: booking.vehicle_id },
        data: { status: 'In_Trip' },
      });
    }

    // Insert history record
    await tx.bookingStatusHistory.create({
      data: {
        booking_id: id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: currentUserId,
        notes: transitionNotes || `Status updated from ${oldStatus} to ${newStatus}.`,
      },
    });

    return updated;
  });

  await auditService.logAction(
    currentUserId,
    'Booking Status Updated',
    'BOOKING',
    id,
    oldStatus,
    newStatus
  );

  if (newStatus === 'Cancelled') {
    await notificationService.createNotification({
      title: 'Booking Cancelled',
      message: `Booking ${booking.booking_number} has been cancelled.`,
      type: 'BOOKING',
      priority: 'HIGH',
      creatorId: currentUserId,
    });
  }

  return updatedBooking;
};

const assignDriver = async (id, driverId, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    throw new ForbiddenError('Drivers cannot assign drivers.');
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  const driver = await prisma.driverProfile.findUnique({ where: { id: driverId } });
  if (!driver) {
    throw new NotFoundError('Driver profile not found.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBooking = await tx.booking.update({
      where: { id },
      data: {
        assigned_driver_id: driverId,
        status: 'Driver_Assigned',
      },
    });

    // Update driver duty state in DB
    await tx.driverProfile.update({
      where: { id: driverId },
      data: {
        assigned_vehicle_id: booking.vehicle_id,
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        booking_id: id,
        old_status: booking.status,
        new_status: 'Driver_Assigned',
        changed_by: currentUserId,
        notes: 'Driver assigned to booking.',
      },
    });

    // Check if delivery exists for this booking to sync it
    let delivery = await tx.delivery.findFirst({ where: { booking_id: id } });
    if (delivery) {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          driver_id: driverId,
          status: 'Assigned'
        }
      });
      await tx.deliveryStatusHistory.create({
        data: {
          delivery_id: delivery.id,
          old_status: delivery.status,
          new_status: 'Assigned',
          changed_by: currentUserId,
          notes: 'Driver assigned via booking update.'
        }
      });
    } else {
      const dCount = await tx.delivery.count();
      const dNumber = `DEL-${new Date().getFullYear()}-${String(dCount + 1).padStart(4, '0')}`;
      
      delivery = await tx.delivery.create({
        data: {
          delivery_number: dNumber,
          booking_id: id,
          vehicle_id: booking.vehicle_id,
          driver_id: driverId,
          customer_id: booking.customer_id,
          delivery_address: booking.pickup_location || 'Beverly Hills Hub',
          pickup_address: booking.pickup_location || 'Beverly Hills Hub',
          scheduled_date: booking.pickup_date || new Date(),
          status: 'Assigned',
          notes: 'Auto-created from driver assignment.'
        }
      });
      await tx.deliveryStatusHistory.create({
        data: {
          delivery_id: delivery.id,
          old_status: 'Pending',
          new_status: 'Assigned',
          changed_by: currentUserId,
          notes: 'Delivery auto-created and driver assigned.'
        }
      });
    }

    return updatedBooking;
  });

  await auditService.logAction(
    currentUserId,
    'Booking Assigned',
    'BOOKING',
    id,
    null,
    { assigned_driver_id: driverId }
  );

  await notificationService.createNotification({
    title: 'Booking Assigned',
    message: `You have been assigned to booking ${booking.booking_number}.`,
    type: 'BOOKING',
    priority: 'HIGH',
    creatorId: currentUserId,
    specificUserIds: [driver.user_id],
  });

  return updated;
};

const addBookingNote = async (id, noteText, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    throw new ForbiddenError('Drivers are not permitted to add booking notes.');
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  const note = await prisma.bookingNote.create({
    data: {
      booking_id: id,
      note: noteText,
      created_by: currentUserId,
    },
  });

  return note;
};

const softDeleteBooking = async (id, currentUserId, currentUserRole) => {
  // Only ADMIN can delete booking logs
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Admin users are permitted to delete bookings.');
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Booking not found.');
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: { is_deleted: true },
    }),
    prisma.vehicle.update({
      where: { id: booking.vehicle_id },
      data: { status: 'Available' },
    })
  ]);
};

const createPublicBooking = async (bookingBody) => {
  const {
    fullName,
    email,
    phone,
    streetAddress,
    city,
    state,
    zipCode,
    country,
    vehicleId,
    pickupDate,
    returnDate,
    pickupLocation,
    rentalDays,
    subtotal,
    tax,
    fees,
    totalAmount,
    paymentMethod,
    licenseFront,
    licenseBack,
    signatureType,
    typedSignature,
    drawnSignatureData
  } = bookingBody;

  // 1. Create or find customer by email
  let customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        full_name: fullName,
        email,
        phone,
        address: `${streetAddress}, ${city}, ${state} ${zipCode}, ${country}`,
        driving_license_front: licenseFront || null,
        driving_license_back: licenseBack || null,
      },
    });
  } else {
    if (licenseFront || licenseBack) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          driving_license_front: licenseFront || customer.driving_license_front,
          driving_license_back: licenseBack || customer.driving_license_back,
        }
      });
    }
  }

  // 2. Find any Admin user to satisfy DB constraint of changed_by (BookingStatusHistory -> User)
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN', is_deleted: false },
  });
  if (!adminUser) {
    throw new BadRequestError('Admin user must exist to log booking status history.');
  }

  // 3. Delegate to createBooking
  const newBooking = await createBooking({
    customerId: customer.id,
    vehicleId,
    pickupDate,
    returnDate,
    pickupLocation,
    deliveryAddress: `${streetAddress}, ${city}, ${state} ${zipCode}, ${country}`,
    rentalDays,
    subtotal,
    tax,
    fees,
    totalAmount,
    paymentMethod,
  }, adminUser.id);

  // 4. Create Contract using signatures
  const cCount = await prisma.contract.count();
  const cNumber = `CON-${new Date().getFullYear()}-${String(cCount + 1).padStart(4, '0')}`;
  
  await prisma.contract.create({
    data: {
      contract_number: cNumber,
      booking_id: newBooking.id,
      customer_id: customer.id,
      vehicle_id: vehicleId,
      contract_version: "v1.0",
      contract_content: "Standard standard rental vehicle lease compact agreement. Terms of liability and insurance apply.",
      signature_type: signatureType === 'type' ? 'TYPE' : (signatureType === 'draw' ? 'DRAW' : null),
      typed_signature: typedSignature || null,
      signature_image: drawnSignatureData || null,
      signed: !!(typedSignature || drawnSignatureData),
      signed_at: (typedSignature || drawnSignatureData) ? new Date() : null,
      status: (typedSignature || drawnSignatureData) ? 'Signed' : 'Draft'
    }
  });

  if (typedSignature || drawnSignatureData) {
    await prisma.booking.update({
      where: { id: newBooking.id },
      data: {
        contract_signed: true,
        status: 'Contract_Signed'
      }
    });

    await prisma.bookingStatusHistory.create({
      data: {
        booking_id: newBooking.id,
        old_status: newBooking.status,
        new_status: 'Contract_Signed',
        changed_by: adminUser.id,
        notes: 'Booking created with online signature. Advanced to Contract Signed.',
      }
    });

    // We must update the returned object to reflect the new status
    newBooking.status = 'Contract_Signed';
    newBooking.contract_signed = true;
  }

  // Handle Stripe Credit Card integration
  if (paymentMethod === 'CREDIT_DEBIT_CARD') {
    const originalStatus = newBooking.status;
    
    // Override status to Payment_Pending
    await prisma.booking.update({
      where: { id: newBooking.id },
      data: {
        status: 'Payment_Pending'
      }
    });

    await prisma.bookingStatusHistory.create({
      data: {
        booking_id: newBooking.id,
        old_status: originalStatus,
        new_status: 'Payment_Pending',
        changed_by: adminUser.id,
        notes: 'Stripe Credit Card payment initialized. Booking moved to Payment Pending.',
      }
    });

    newBooking.status = 'Payment_Pending';

    // Create Stripe PaymentIntent
    const amountInCents = Math.round(Number(totalAmount) * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        booking_id: newBooking.id,
        booking_number: newBooking.booking_number,
        customer_id: customer.id,
        customer_name: customer.full_name,
        customer_email: customer.email,
      },
    });

    // Create Payment record in DB
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentNumber = `PAY-${year}-${randomSuffix}`;

    const dbPayment = await prisma.payment.create({
      data: {
        payment_number: paymentNumber,
        booking_id: newBooking.id,
        customer_id: customer.id,
        payment_method: 'CREDIT_DEBIT_CARD',
        amount: totalAmount,
        paid_amount: 0.00,
        remaining_amount: totalAmount,
        status: 'Pending',
        transaction_reference: paymentIntent.id,
        notes: 'Stripe PaymentIntent initialized.',
      },
    });

    await prisma.paymentHistory.create({
      data: {
        payment_id: dbPayment.id,
        old_status: 'Pending',
        new_status: 'Pending',
        changed_by: adminUser.id,
        notes: 'Payment record initialized for Stripe Checkout.',
      },
    });

    // Attach Stripe data to returned object
    newBooking.clientSecret = paymentIntent.client_secret;
    newBooking.paymentIntentId = paymentIntent.id;
  }

  return newBooking;
};

const cancelPublicBooking = async (id) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
  });

  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }

  // Only allow cancelling if it's Payment_Pending (unpaid public attempt)
  if (booking.status !== 'Payment_Pending') {
    throw new BadRequestError('Only pending payment bookings can be cancelled.');
  }

  await prisma.$transaction([
    // 1. Soft delete the booking
    prisma.booking.update({
      where: { id },
      data: { is_deleted: true },
    }),
    // 2. Set vehicle status back to Available
    prisma.vehicle.update({
      where: { id: booking.vehicle_id },
      data: { status: 'Available' },
    }),
    // 3. Mark payment as Cancelled if exists
    prisma.payment.updateMany({
      where: { booking_id: id },
      data: { status: 'Cancelled' },
    }),
  ]);
};

const checkPublicAvailability = async (vehicleId, pickupDate, returnDate) => {
  const overlap = await checkOverlappingBookings(vehicleId, pickupDate, returnDate);
  return { available: !overlap };
};

const getVehicleBookedDates = async (vehicleId) => {
  const bookings = await prisma.booking.findMany({
    where: {
      vehicle_id: vehicleId,
      is_deleted: false,
      status: { notIn: ['Cancelled', 'Rejected'] },
      return_date: { gte: new Date() }, // Only future bookings
    },
    select: {
      pickup_date: true,
      return_date: true,
    }
  });
  return bookings;
};

module.exports = {
  createBooking,
  createPublicBooking,
  cancelPublicBooking,
  getBookings,
  getBookingById,
  updateBooking,
  updateBookingStatus,
  assignDriver,
  addBookingNote,
  softDeleteBooking,
  checkPublicAvailability,
  getVehicleBookedDates,
};
