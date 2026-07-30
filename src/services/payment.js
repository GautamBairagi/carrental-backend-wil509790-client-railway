const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');
const notificationService = require('./notification');

const generatePaymentNumber = async () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `PAY-${year}-${randomSuffix}`;
};

const assertDriverPaymentAccess = async (payment, currentUserId, currentUserRole) => {
  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    const booking = await prisma.booking.findUnique({ where: { id: payment.booking_id } });
    if (!driverProfile || !booking || booking.assigned_driver_id !== driverProfile.id) {
      throw new ForbiddenError('You only have permission to view payments for your assigned bookings.');
    }
  }
};

const createPayment = async (paymentBody, currentUserId) => {
  const { bookingId, amount, paymentMethod, notes } = paymentBody;

  // Retrieve booking context
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError('Parent booking not found.');
  }

  // Strict booking validation before payment
  if (!booking.contract_signed && booking.status !== 'Contract_Signed') {
    const signedContract = await prisma.contract.findFirst({
      where: { booking_id: bookingId, signed: true }
    });

    if (!signedContract) {
      const blockedStatuses = [
        'Draft',
        'Pending_Review',
        'License_Verification_Pending',
        'License_Verified',
        'Contract_Sent',
      ];
      if (blockedStatuses.includes(booking.status)) {
        throw new BadRequestError('Booking contract must be signed before payment can be processed.');
      }
    } else {
      // Auto-sync existing booking to prevent further inconsistencies
      await prisma.booking.update({
        where: { id: bookingId },
        data: { contract_signed: true, status: 'Contract_Signed' }
      });
    }
  }

  const paymentNumber = await generatePaymentNumber();

  const payment = await prisma.$transaction(async (tx) => {
    const newPayment = await tx.payment.create({
      data: {
        payment_number: paymentNumber,
        booking_id: bookingId,
        customer_id: booking.customer_id,
        payment_method: paymentMethod,
        amount: amount,
        paid_amount: 0.00,
        remaining_amount: amount,
        status: 'Pending',
        notes: notes || null,
      },
    });

    await tx.paymentHistory.create({
      data: {
        payment_id: newPayment.id,
        old_status: 'Pending',
        new_status: 'Pending',
        changed_by: currentUserId,
        notes: 'Payment record initialized.',
      },
    });

    return newPayment;
  });

  await notificationService.createNotification({
    title: 'Payment Pending',
    message: `Payment request of $${amount} initialized for booking ${booking.booking_number}.`,
    type: 'PAYMENT',
    priority: 'MEDIUM',
    creatorId: currentUserId,
  });

  return payment;
};

const recordTransaction = async (paymentId, transactionBody, currentUserId) => {
  const { amount, paymentMethod, transactionReference, proofImageUrl, notes } = transactionBody;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    throw new NotFoundError('Payment record not found.');
  }

  const updatedPayment = await prisma.$transaction(async (tx) => {
    // 1. Create the transaction record
    const transaction = await tx.paymentTransaction.create({
      data: {
        payment_id: paymentId,
        amount: amount,
        payment_method: paymentMethod,
        transaction_reference: transactionReference || null,
        proof_image_url: proofImageUrl || null,
        received_by: currentUserId,
        notes: notes || null,
      },
    });

    // 2. Aggregate transactions to calculate new paid and remaining totals
    const allTransactions = await tx.paymentTransaction.findMany({
      where: { payment_id: paymentId },
    });

    let totalPaid = 0;
    for (const t of allTransactions) {
      totalPaid += Number(t.amount);
    }

    const totalAmount = Number(payment.amount);
    const newRemaining = Math.max(0, totalAmount - totalPaid);

    let newStatus = 'Pending';
    if (totalPaid >= totalAmount) {
      newStatus = 'Paid';
    } else if (totalPaid > 0) {
      newStatus = 'Partially_Paid';
    }

    const oldStatus = payment.status;

    // 3. Update the payment totals and status
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        paid_amount: totalPaid,
        remaining_amount: newRemaining,
        status: newStatus,
        transaction_reference: transactionReference || payment.transaction_reference,
        payment_date: new Date(),
      },
    });

    // 4. Log status change history if transition occurs
    if (oldStatus !== newStatus) {
      await tx.paymentHistory.create({
        data: {
          payment_id: paymentId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: currentUserId,
          notes: `Transaction of $${amount} received. Status updated from ${oldStatus} to ${newStatus}.`,
        },
      });

      // 5. Cascade updates to Booking model if status becomes Paid
      if (newStatus === 'Paid') {
        const booking = await tx.booking.findUnique({ where: { id: payment.booking_id } });
        if (booking) {
          await tx.booking.update({
            where: { id: payment.booking_id },
            data: {
              payment_completed: true,
              status: 'Payment_Completed',
            },
          });

          await tx.bookingStatusHistory.create({
            data: {
              booking_id: payment.booking_id,
              old_status: booking.status,
              new_status: 'Payment_Completed',
              changed_by: currentUserId,
              notes: 'Payment completed in full. Booking status updated to Payment Completed.',
            },
          });
        }
      }
    }

    return updated;
  });

  if (updatedPayment.status === 'Paid') {
    const booking = await prisma.booking.findUnique({ where: { id: updatedPayment.booking_id } });
    await notificationService.createNotification({
      title: 'Payment Completed',
      message: `Payment of $${updatedPayment.amount} completed for booking ${booking ? booking.booking_number : 'N/A'}.`,
      type: 'PAYMENT',
      priority: 'HIGH',
      creatorId: currentUserId,
    });
  }

  return updatedPayment;
};

const getPayments = async (queryFilters, currentUserId, currentUserRole) => {
  const { page = 1, limit = 10, bookingId, customerId, status } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = {};

  if (currentUserRole === 'DRIVER') {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { user_id: currentUserId },
    });
    if (!driverProfile) {
      return { payments: [], pagination: { total: 0, page: 1, limit: take, totalPages: 0 } };
    }
    where.booking = { assigned_driver_id: driverProfile.id };
  }

  if (bookingId) {
    where.booking_id = bookingId;
  }

  if (customerId) {
    where.customer_id = customerId;
  }

  if (status) {
    where.status = status;
  }

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        transactions: true,
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    payments,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getPaymentById = async (id, currentUserId, currentUserRole) => {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      histories: true,
      transactions: true,
    },
  });

  if (!payment) {
    throw new NotFoundError('Payment record not found.');
  }

  await assertDriverPaymentAccess(payment, currentUserId, currentUserRole);

  return payment;
};

const refundPayment = async (id, refundBody, currentUserId, currentUserRole) => {
  // Only Admin can refund
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only administrators can process refunds.');
  }

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    throw new NotFoundError('Payment record not found.');
  }

  const { notes } = refundBody;
  const oldStatus = payment.status;

  const updated = await prisma.$transaction(async (tx) => {
    // Record a negative transaction representing the refund amount
    const refundAmount = Number(payment.paid_amount);
    
    await tx.paymentTransaction.create({
      data: {
        payment_id: id,
        amount: -refundAmount,
        payment_method: payment.payment_method,
        notes: notes || 'Refund processed.',
        received_by: currentUserId,
      },
    });

    const updatedPayment = await tx.payment.update({
      where: { id },
      data: {
        status: 'Refunded',
        paid_amount: 0.00,
        remaining_amount: payment.amount,
      },
    });

    await tx.paymentHistory.create({
      data: {
        payment_id: id,
        old_status: oldStatus,
        new_status: 'Refunded',
        changed_by: currentUserId,
        notes: notes || 'Payment refunded.',
      },
    });

    return updatedPayment;
  });

  await auditService.logAction(
    currentUserId,
    'Payment Refunded',
    'PAYMENT',
    id,
    oldStatus,
    'Refunded'
  );

  await notificationService.createNotification({
    title: 'Payment Refunded',
    message: `Payment ${payment.payment_number} has been refunded.`,
    type: 'PAYMENT',
    priority: 'HIGH',
    creatorId: currentUserId,
  });

  return updated;
};

const updatePaymentStatusManual = async (id, statusBody, currentUserId, currentUserRole) => {
  // Manual status overrides are restricted to Admin and Operations Manager
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('You do not have permission to update payment status manually.');
  }

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    throw new NotFoundError('Payment record not found.');
  }

  const { status, notes } = statusBody;
  const oldStatus = payment.status;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id },
      data: { status },
    });

    await tx.paymentHistory.create({
      data: {
        payment_id: id,
        old_status: oldStatus,
        new_status: status,
        changed_by: currentUserId,
        notes: notes || 'Payment status updated manually.',
      },
    });

    // Cascade to booking if transitioned to Paid
    if (status === 'Paid' && oldStatus !== 'Paid') {
      const booking = await tx.booking.findUnique({ where: { id: payment.booking_id } });
      if (booking) {
        await tx.booking.update({
          where: { id: payment.booking_id },
          data: {
            payment_completed: true,
            status: 'Payment_Completed',
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            booking_id: payment.booking_id,
            old_status: booking.status,
            new_status: 'Payment_Completed',
            changed_by: currentUserId,
            notes: 'Payment status marked as Paid manually. Booking status updated to Payment Completed.',
          },
        });
      }
    }

    return updatedPayment;
  });

  if (status === 'Paid') {
    await notificationService.createNotification({
      title: 'Payment Completed',
      message: `Payment ${payment.payment_number} marked as Paid manually.`,
      type: 'PAYMENT',
      priority: 'HIGH',
      creatorId: currentUserId,
    });
  } else if (status === 'Failed') {
    await notificationService.createNotification({
      title: 'Payment Failed',
      message: `Payment ${payment.payment_number} has failed.`,
      type: 'PAYMENT',
      priority: 'CRITICAL',
      creatorId: currentUserId,
    });
  }

  return updated;
};

module.exports = {
  createPayment,
  recordTransaction,
  getPayments,
  getPaymentById,
  refundPayment,
  updatePaymentStatusManual,
};
