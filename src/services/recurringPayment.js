const prisma = require('../config/db');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const paymentService = require('./payment');

const calculateScheduleState = (schedule) => {
  if (schedule.status === 'PAUSED') return 'PAUSED';
  if (schedule.status === 'CANCELLED') return 'CANCELLED';
  if (schedule.status === 'COMPLETED') return 'COMPLETED';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(schedule.next_due_date);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();

  if (diffTime > 0) {
    return 'UPCOMING';
  } else if (diffTime === 0) {
    return 'DUE';
  } else {
    return 'OVERDUE';
  }
};

const advanceNextDueDate = (currentDueDate, interval) => {
  const nextDate = new Date(currentDueDate);

  if (interval === 'WEEKLY') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (interval === 'BIWEEKLY') {
    nextDate.setDate(nextDate.getDate() + 14);
  } else if (interval === 'MONTHLY') {
    const currentDay = nextDate.getDate();
    nextDate.setMonth(nextDate.getMonth() + 1);
    // Calendar month handling for month-end dates (e.g., Jan 31 -> Feb 28/29)
    if (nextDate.getDate() !== currentDay) {
      nextDate.setDate(0);
    }
  }

  return nextDate;
};

const createSchedule = async (data, creatorId) => {
  const {
    booking_id,
    customer_id,
    amount_per_cycle,
    interval = 'WEEKLY',
    start_date,
    next_due_date,
    end_date,
    total_payments = 1,
    payment_method = 'CREDIT_DEBIT_CARD',
    auto_charge = false,
  } = data;

  let resolvedCustomerId = customer_id;

  // 1. Verify booking exists
  const booking = await prisma.booking.findUnique({
    where: { id: booking_id },
  });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError(`Booking with ID ${booking_id} not found.`);
  }

  if (!resolvedCustomerId && booking.customer_id) {
    resolvedCustomerId = booking.customer_id;
  }

  // 2. Verify customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: resolvedCustomerId },
  });
  if (!customer) {
    throw new NotFoundError(`Customer with ID ${resolvedCustomerId} not found.`);
  }

  // 3. Customer-Booking Mismatch Check: Booking MUST belong to the selected customer
  if (booking.customer_id !== resolvedCustomerId) {
    throw new BadRequestError(
      `Booking ${booking_id} does not belong to customer ${resolvedCustomerId}. Customer mismatch.`
    );
  }

  const numPayments = Math.max(1, parseInt(total_payments, 10) || 1);
  const startDateObj = new Date(start_date);
  const nextDueDateObj = next_due_date ? new Date(next_due_date) : new Date(startDateObj);

  // Auto-calculate end_date if omitted: (numPayments * 7 days for WEEKLY)
  let calculatedEndDate = end_date ? new Date(end_date) : null;
  if (!calculatedEndDate) {
    calculatedEndDate = new Date(startDateObj);
    const daysToAdd = interval === 'WEEKLY' ? (numPayments * 7) : (numPayments * 14);
    calculatedEndDate.setDate(calculatedEndDate.getDate() + daysToAdd);
  }

  // Stripe Customer check if auto_charge requested
  let stripeCustomerId = null;
  if (auto_charge && payment_method === 'CREDIT_DEBIT_CARD') {
    try {
      const stripe = require('../config/stripe');
      if (process.env.STRIPE_SECRET_KEY && stripe) {
        const existingStripeCustomers = await stripe.customers.list({ email: customer.email, limit: 1 });
        if (existingStripeCustomers.data?.length > 0) {
          stripeCustomerId = existingStripeCustomers.data[0].id;
        } else {
          const newCust = await stripe.customers.create({
            email: customer.email,
            name: customer.full_name,
            phone: customer.phone || undefined,
            metadata: { customer_id: customer.id, booking_id },
          });
          stripeCustomerId = newCust.id;
        }
      }
    } catch (sErr) {
      logger.warn(`Stripe customer lookup warning for recurring schedule: ${sErr.message}`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringPaymentSchedule.create({
      data: {
        booking_id,
        customer_id: resolvedCustomerId,
        amount_per_cycle: Number(amount_per_cycle),
        interval,
        start_date: startDateObj,
        next_due_date: nextDueDateObj,
        end_date: calculatedEndDate,
        payment_method,
        auto_charge: !!auto_charge,
        total_payments: numPayments,
        payments_completed: 0,
        payments_remaining: numPayments,
        stripe_customer_id: stripeCustomerId,
        status: 'ACTIVE',
      },
      include: {
        customer: {
          select: { id: true, full_name: true, email: true, phone: true },
        },
        booking: {
          select: {
            id: true,
            booking_number: true,
            pickup_date: true,
            return_date: true,
            status: true,
            vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
          },
        },
      },
    });

    return schedule;
  });

  try {
    await prisma.auditLog.create({
      data: {
        user_id: creatorId,
        action: 'CREATE_RECURRING_SCHEDULE',
        module: 'RECURRING_PAYMENT',
        record_id: result.id,
        new_value: JSON.stringify({
          booking_id: result.booking_id,
          customer_id: result.customer_id,
          amount_per_cycle: result.amount_per_cycle,
          interval: result.interval,
          next_due_date: result.next_due_date,
        }),
      },
    });
  } catch (auditErr) {
    logger.warn('Audit log creation warning:', auditErr);
  }

  const calculatedState = calculateScheduleState(result);
  logger.info(`RecurringPaymentSchedule ${result.id} created successfully by user ${creatorId}.`);

  return {
    ...result,
    calculated_state: calculatedState,
  };
};

const getSchedules = async (queryFilters) => {
  const {
    customer_id,
    booking_id,
    status,
    interval,
    due_state,
    start_date,
    end_date,
    page = 1,
    limit = 20,
  } = queryFilters;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  if (customer_id) where.customer_id = customer_id;
  if (booking_id) where.booking_id = booking_id;
  if (status) where.status = status;
  if (interval) where.interval = interval;

  if (start_date && end_date) {
    where.next_due_date = {
      gte: new Date(start_date),
      lte: new Date(end_date),
    };
  }

  const allSchedules = await prisma.recurringPaymentSchedule.findMany({
    where,
    orderBy: { next_due_date: 'asc' },
    include: {
      customer: {
        select: { id: true, full_name: true, email: true, phone: true },
      },
      booking: {
        select: {
          id: true,
          booking_number: true,
          pickup_date: true,
          return_date: true,
          status: true,
          vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
        },
      },
    },
  });

  // Append dynamic calculated state to every schedule
  let mapped = allSchedules.map((s) => ({
    ...s,
    calculated_state: calculateScheduleState(s),
  }));

  // Apply due_state filter if requested
  if (due_state) {
    mapped = mapped.filter((s) => s.calculated_state === due_state.toUpperCase());
  }

  const total = mapped.length;
  const paginated = mapped.slice(skip, skip + limitNum);
  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    schedules: paginated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  };
};

const getScheduleById = async (id) => {
  const schedule = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, full_name: true, email: true, phone: true },
      },
      booking: {
        select: {
          id: true,
          booking_number: true,
          pickup_date: true,
          return_date: true,
          status: true,
          vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
        },
      },
    },
  });

  if (!schedule) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  return {
    ...schedule,
    calculated_state: calculateScheduleState(schedule),
  };
};

const updateSchedule = async (id, data, updaterId) => {
  const existing = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  const updateData = {};
  if (data.amount_per_cycle !== undefined) updateData.amount_per_cycle = Number(data.amount_per_cycle);
  if (data.interval !== undefined) updateData.interval = data.interval;
  if (data.start_date !== undefined) updateData.start_date = new Date(data.start_date);
  if (data.next_due_date !== undefined) updateData.next_due_date = new Date(data.next_due_date);
  if (data.end_date !== undefined) updateData.end_date = data.end_date ? new Date(data.end_date) : null;
  if (data.payment_method !== undefined) updateData.payment_method = data.payment_method;
  if (data.status !== undefined) updateData.status = data.status;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringPaymentSchedule.update({
      where: { id },
      data: updateData,
      include: {
        customer: { select: { id: true, full_name: true, email: true, phone: true } },
        booking: {
          select: {
            id: true,
            booking_number: true,
            pickup_date: true,
            return_date: true,
            status: true,
            vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        user_id: updaterId,
        action: 'UPDATE_RECURRING_SCHEDULE',
        module: 'RECURRING_PAYMENT',
        record_id: id,
        old_value: JSON.stringify(existing),
        new_value: JSON.stringify(updated),
      },
    });

    return updated;
  });

  logger.info(`RecurringPaymentSchedule ${id} updated by user ${updaterId}.`);
  return {
    ...result,
    calculated_state: calculateScheduleState(result),
  };
};

const updateScheduleStatus = async (id, newStatus, updaterId) => {
  const existing = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringPaymentSchedule.update({
      where: { id },
      data: { status: newStatus },
      include: {
        customer: { select: { id: true, full_name: true, email: true, phone: true } },
        booking: {
          select: {
            id: true,
            booking_number: true,
            pickup_date: true,
            return_date: true,
            status: true,
            vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
          },
        },
      },
    });

    let auditAction = 'CHANGE_SCHEDULE_STATUS';
    if (newStatus === 'PAUSED') auditAction = 'PAUSE_RECURRING_SCHEDULE';
    else if (newStatus === 'ACTIVE') auditAction = 'RESUME_RECURRING_SCHEDULE';
    else if (newStatus === 'CANCELLED') auditAction = 'CANCEL_RECURRING_SCHEDULE';
    else if (newStatus === 'COMPLETED') auditAction = 'COMPLETE_RECURRING_SCHEDULE';

    await tx.auditLog.create({
      data: {
        user_id: updaterId,
        action: auditAction,
        module: 'RECURRING_PAYMENT',
        record_id: id,
        old_value: JSON.stringify({ status: existing.status }),
        new_value: JSON.stringify({ status: updated.status }),
      },
    });

    return updated;
  });

  logger.info(`RecurringPaymentSchedule ${id} status updated to ${newStatus} by user ${updaterId}.`);
  return {
    ...result,
    calculated_state: calculateScheduleState(result),
  };
};

const processCyclePayment = async (id, cyclePaymentData = {}, updaterId) => {
  const schedule = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, full_name: true, email: true, phone: true } },
      booking: { select: { id: true, booking_number: true, subtotal: true, total_amount: true } },
    }
  });

  if (!schedule) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  if (schedule.status === 'CANCELLED' || schedule.status === 'COMPLETED') {
    throw new BadRequestError(`Cannot process payment for schedule in ${schedule.status} status.`);
  }

  const cycleAmount = cyclePaymentData.amount ? Number(cyclePaymentData.amount) : Number(schedule.amount_per_cycle);
  const transactionRef = cyclePaymentData.transaction_reference || `REC-CYCLE-${id.substring(0, 8)}-${Date.now()}`;

  // Idempotency check: don't double record if this transaction_reference was already processed
  const existingTx = await prisma.paymentTransaction.findFirst({
    where: { transaction_reference: transactionRef }
  });
  if (existingTx) {
    logger.info(`Transaction ${transactionRef} already recorded. Idempotent return.`);
    return {
      schedule: {
        ...schedule,
        calculated_state: calculateScheduleState(schedule)
      },
      transaction: existingTx,
      idempotent: true
    };
  }

  // 1. If auto_charge is enabled and card on file, execute Stripe charge
  if (schedule.auto_charge && schedule.payment_method === 'CREDIT_DEBIT_CARD' && !cyclePaymentData.skipStripeCharge) {
    try {
      const stripe = require('../config/stripe');
      if (process.env.STRIPE_SECRET_KEY && schedule.stripe_customer_id) {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: schedule.stripe_customer_id,
          type: 'card',
        });
        const defaultPm = paymentMethods.data?.[0];
        if (defaultPm) {
          const pi = await stripe.paymentIntents.create({
            amount: Math.round(cycleAmount * 100),
            currency: 'usd',
            customer: schedule.stripe_customer_id,
            payment_method: defaultPm.id,
            off_session: true,
            confirm: true,
            description: `Weekly Rental - Schedule ${id.substring(0, 8)} Payment ${(schedule.payments_completed || 0) + 1}/${schedule.total_payments || 1}`,
            metadata: {
              schedule_id: schedule.id,
              booking_id: schedule.booking_id,
              cycle_number: String((schedule.payments_completed || 0) + 1),
            },
          });
          cyclePaymentData.transaction_reference = pi.id;
        }
      }
    } catch (chargeErr) {
      logger.error('Automatic Stripe cycle charge failed:', chargeErr);
      await prisma.recurringPaymentSchedule.update({
        where: { id },
        data: {
          failed_attempts: (schedule.failed_attempts || 0) + 1,
          last_error: chargeErr.message,
          status: (schedule.failed_attempts || 0) >= 2 ? 'FAILED' : schedule.status,
        },
      });
      throw new BadRequestError(`Automated recurring charge failed: ${chargeErr.message}`);
    }
  }

  // 2. Increment completed count and decrement remaining
  const newPaymentsCompleted = (schedule.payments_completed || 0) + 1;
  const totalTarget = schedule.total_payments || 1;
  const newPaymentsRemaining = Math.max(0, totalTarget - newPaymentsCompleted);

  // 3. Calculate next due date using calendar logic
  const nextDueDate = advanceNextDueDate(schedule.next_due_date, schedule.interval);

  // 4. Check if finished
  let newStatus = schedule.status;
  if (newPaymentsRemaining <= 0 || (schedule.end_date && nextDueDate > new Date(schedule.end_date))) {
    newStatus = 'COMPLETED';
  }

  // 5. Link to booking's Payment record
  let bookingPayment = await prisma.payment.findFirst({
    where: { booking_id: schedule.booking_id },
  });

  if (!bookingPayment) {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    bookingPayment = await prisma.payment.create({
      data: {
        payment_number: `PAY-REC-${year}-${randomSuffix}`,
        booking_id: schedule.booking_id,
        customer_id: schedule.customer_id,
        payment_method: schedule.payment_method,
        amount: schedule.amount_per_cycle,
        paid_amount: 0,
        remaining_amount: schedule.amount_per_cycle,
        status: 'Partially_Paid',
      }
    });
  }

  let recordedTransaction = null;
  if (bookingPayment) {
    recordedTransaction = await paymentService.recordTransaction(
      bookingPayment.id,
      {
        amount: cycleAmount,
        paymentMethod: cyclePaymentData.payment_method || schedule.payment_method,
        transactionReference: cyclePaymentData.transaction_reference || transactionRef,
        notes: cyclePaymentData.notes || `Recurring weekly payment ${newPaymentsCompleted}/${totalTarget} for schedule ${id.substring(0, 8)}`,
      },
      updaterId
    );
  }

  // 6. Advance schedule in database
  const updatedSchedule = await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringPaymentSchedule.update({
      where: { id },
      data: {
        payments_completed: newPaymentsCompleted,
        payments_remaining: newPaymentsRemaining,
        last_payment_date: new Date(),
        next_due_date: newStatus === 'COMPLETED' ? schedule.next_due_date : nextDueDate,
        status: newStatus,
        failed_attempts: 0,
        last_error: null,
      },
      include: {
        customer: { select: { id: true, full_name: true, email: true, phone: true } },
        booking: { select: { id: true, booking_number: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        user_id: updaterId,
        action: 'PROCESS_RECURRING_CYCLE',
        module: 'RECURRING_PAYMENT',
        record_id: id,
        old_value: JSON.stringify({
          payments_completed: schedule.payments_completed,
          next_due_date: schedule.next_due_date,
          status: schedule.status
        }),
        new_value: JSON.stringify({
          payments_completed: updated.payments_completed,
          payments_remaining: updated.payments_remaining,
          next_due_date: updated.next_due_date,
          status: updated.status
        }),
      },
    });

    return updated;
  });

  logger.info(`Recurring cycle payment ${newPaymentsCompleted}/${totalTarget} processed for schedule ${id}. Status: ${newStatus}`);

  return {
    schedule: {
      ...updatedSchedule,
      calculated_state: calculateScheduleState(updatedSchedule),
    },
    transaction: recordedTransaction,
  };
};

const cancelSchedule = async (id, reason = '', userId) => {
  const schedule = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
  });

  if (!schedule) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  if (schedule.status === 'CANCELLED') {
    return schedule;
  }

  if (schedule.stripe_subscription_id) {
    try {
      const stripe = require('../config/stripe');
      if (stripe && process.env.STRIPE_SECRET_KEY) {
        await stripe.subscriptions.cancel(schedule.stripe_subscription_id);
      }
    } catch (stripeErr) {
      logger.warn(`Stripe subscription cancellation warning: ${stripeErr.message}`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.recurringPaymentSchedule.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        auto_charge: false,
        last_error: reason ? `Cancelled: ${reason}` : 'Cancelled by administrator',
      },
      include: {
        customer: { select: { id: true, full_name: true, email: true, phone: true } },
        booking: { select: { id: true, booking_number: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        user_id: userId,
        action: 'CANCEL_RECURRING_SCHEDULE',
        module: 'RECURRING_PAYMENT',
        record_id: id,
        old_value: JSON.stringify({ status: schedule.status }),
        new_value: JSON.stringify({ status: 'CANCELLED', reason }),
      },
    });

    return res;
  });

  logger.info(`RecurringPaymentSchedule ${id} cancelled by user ${userId}.`);
  return {
    ...updated,
    calculated_state: 'CANCELLED',
  };
};

const getOverdueSchedules = async () => {
  const activeSchedules = await prisma.recurringPaymentSchedule.findMany({
    where: { status: 'ACTIVE' },
    include: {
      customer: { select: { id: true, full_name: true, email: true, phone: true } },
      booking: {
        select: {
          id: true,
          booking_number: true,
          pickup_date: true,
          return_date: true,
          status: true,
          vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
        },
      },
    },
    orderBy: { next_due_date: 'asc' },
  });

  const overdueOrDue = activeSchedules
    .map((s) => ({
      ...s,
      calculated_state: calculateScheduleState(s),
    }))
    .filter((s) => s.calculated_state === 'OVERDUE' || s.calculated_state === 'DUE');

  return overdueOrDue;
};

module.exports = {
  calculateScheduleState,
  advanceNextDueDate,
  createSchedule,
  getSchedules,
  getScheduleById,
  updateSchedule,
  updateScheduleStatus,
  processCyclePayment,
  cancelSchedule,
  getOverdueSchedules,
};
