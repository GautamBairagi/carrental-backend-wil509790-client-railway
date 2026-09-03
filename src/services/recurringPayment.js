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
    interval,
    start_date,
    next_due_date,
    end_date,
    payment_method = 'CREDIT_DEBIT_CARD',
    auto_charge = false,
  } = data;

  // 1. Verify customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: customer_id },
  });
  if (!customer) {
    throw new NotFoundError(`Customer with ID ${customer_id} not found.`);
  }

  // 2. Verify booking exists
  const booking = await prisma.booking.findUnique({
    where: { id: booking_id },
  });
  if (!booking || booking.is_deleted) {
    throw new NotFoundError(`Booking with ID ${booking_id} not found.`);
  }

  // 3. Customer-Booking Mismatch Check: Booking MUST belong to the selected customer
  if (booking.customer_id !== customer_id) {
    throw new BadRequestError(
      `Booking ${booking_id} does not belong to customer ${customer_id}. Customer mismatch.`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringPaymentSchedule.create({
      data: {
        booking_id,
        customer_id,
        amount_per_cycle: Number(amount_per_cycle),
        interval,
        start_date: new Date(start_date),
        next_due_date: new Date(next_due_date),
        end_date: end_date ? new Date(end_date) : null,
        payment_method,
        auto_charge: false,
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

    await tx.auditLog.create({
      data: {
        user_id: creatorId,
        action: 'CREATE_RECURRING_SCHEDULE',
        module: 'RECURRING_PAYMENT',
        record_id: schedule.id,
        new_value: JSON.stringify({
          booking_id: schedule.booking_id,
          customer_id: schedule.customer_id,
          amount_per_cycle: schedule.amount_per_cycle,
          interval: schedule.interval,
          next_due_date: schedule.next_due_date,
        }),
      },
    });

    return schedule;
  });

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

const processCyclePayment = async (id, cyclePaymentData, updaterId) => {
  const schedule = await prisma.recurringPaymentSchedule.findUnique({
    where: { id },
  });

  if (!schedule) {
    throw new NotFoundError(`Recurring payment schedule with ID ${id} not found.`);
  }

  if (schedule.status === 'CANCELLED' || schedule.status === 'COMPLETED') {
    throw new BadRequestError(`Cannot process payment for schedule in ${schedule.status} status.`);
  }

  // 1. Calculate next due date using calendar month logic
  const nextDueDate = advanceNextDueDate(schedule.next_due_date, schedule.interval);

  // 2. Check if end_date is reached
  let newStatus = schedule.status;
  if (schedule.end_date && nextDueDate > new Date(schedule.end_date)) {
    newStatus = 'COMPLETED';
  }

  // 3. Optional: Link actual money transaction to booking's Payment record if present
  const bookingPayment = await prisma.payment.findFirst({
    where: { booking_id: schedule.booking_id },
  });

  let recordedTransaction = null;
  const cycleAmount = cyclePaymentData.amount ? Number(cyclePaymentData.amount) : Number(schedule.amount_per_cycle);

  if (bookingPayment) {
    recordedTransaction = await paymentService.recordTransaction(
      bookingPayment.id,
      {
        amount: cycleAmount,
        paymentMethod: cyclePaymentData.payment_method || schedule.payment_method,
        transactionReference: cyclePaymentData.transaction_reference || `REC-CYCLE-${Date.now()}`,
        notes: cyclePaymentData.notes || `Recurring cycle payment processed for schedule ${id}`,
      },
      updaterId
    );
  }

  // 4. Advance schedule next_due_date & status in database
  const updatedSchedule = await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringPaymentSchedule.update({
      where: { id },
      data: {
        next_due_date: nextDueDate,
        status: newStatus,
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
        old_value: JSON.stringify({ next_due_date: schedule.next_due_date, status: schedule.status }),
        new_value: JSON.stringify({ next_due_date: updated.next_due_date, status: updated.status }),
      },
    });

    return updated;
  });

  logger.info(`Recurring cycle payment processed for schedule ${id}. Next due: ${nextDueDate.toISOString()}`);

  return {
    schedule: {
      ...updatedSchedule,
      calculated_state: calculateScheduleState(updatedSchedule),
    },
    transaction: recordedTransaction,
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
  getOverdueSchedules,
};
