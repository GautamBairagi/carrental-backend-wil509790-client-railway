const { BadRequestError } = require('../utils/errors');

const VALID_INTERVALS = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const VALID_PAYMENT_METHODS = ['CREDIT_DEBIT_CARD', 'ZELLE', 'CASH_APP', 'PAY_AT_DELIVERY', 'CASH', 'BANK_TRANSFER'];

const validateCreateSchedule = (req, res, next) => {
  const {
    booking_id,
    customer_id,
    amount_per_cycle,
    interval,
    start_date,
    next_due_date,
    end_date,
    payment_method,
    auto_charge,
  } = req.body;

  if (!booking_id || typeof booking_id !== 'string') {
    return next(new BadRequestError('booking_id is required and must be a string.'));
  }

  if (!customer_id) {
    if (!booking_id) {
      return next(new BadRequestError('customer_id or booking_id is required.'));
    }
  } else if (typeof customer_id !== 'string') {
    return next(new BadRequestError('customer_id must be a string.'));
  }

  const numericAmount = Number(amount_per_cycle);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return next(new BadRequestError('amount_per_cycle must be a positive number greater than 0.'));
  }

  if (!interval || !VALID_INTERVALS.includes(interval)) {
    return next(new BadRequestError(`interval must be one of: ${VALID_INTERVALS.join(', ')}`));
  }

  if (!start_date || isNaN(Date.parse(start_date))) {
    return next(new BadRequestError('A valid start_date is required.'));
  }

  if (!next_due_date || isNaN(Date.parse(next_due_date))) {
    return next(new BadRequestError('A valid next_due_date is required.'));
  }

  if (end_date) {
    if (isNaN(Date.parse(end_date))) {
      return next(new BadRequestError('end_date must be a valid date.'));
    }
    if (new Date(end_date) < new Date(start_date)) {
      return next(new BadRequestError('end_date cannot be earlier than start_date.'));
    }
  }

  if (payment_method && !VALID_PAYMENT_METHODS.includes(payment_method)) {
    return next(new BadRequestError(`payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`));
  }

  if (auto_charge === true) {
    return next(
      new BadRequestError(
        'Automatic card charging is disabled in this phase. Recurring payment schedules are currently configured for Manual Due-Date Tracking.'
      )
    );
  }

  next();
};

const validateUpdateSchedule = (req, res, next) => {
  const {
    amount_per_cycle,
    interval,
    next_due_date,
    start_date,
    end_date,
    payment_method,
    auto_charge,
    status,
  } = req.body;

  if (amount_per_cycle !== undefined) {
    const numericAmount = Number(amount_per_cycle);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return next(new BadRequestError('amount_per_cycle must be a positive number greater than 0.'));
    }
  }

  if (interval !== undefined && !VALID_INTERVALS.includes(interval)) {
    return next(new BadRequestError(`interval must be one of: ${VALID_INTERVALS.join(', ')}`));
  }

  if (next_due_date !== undefined && isNaN(Date.parse(next_due_date))) {
    return next(new BadRequestError('next_due_date must be a valid date.'));
  }

  if (start_date !== undefined && isNaN(Date.parse(start_date))) {
    return next(new BadRequestError('start_date must be a valid date.'));
  }

  if (end_date !== undefined && end_date !== null) {
    if (isNaN(Date.parse(end_date))) {
      return next(new BadRequestError('end_date must be a valid date or null.'));
    }
  }

  if (payment_method !== undefined && !VALID_PAYMENT_METHODS.includes(payment_method)) {
    return next(new BadRequestError(`payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`));
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return next(new BadRequestError(`status must be one of: ${VALID_STATUSES.join(', ')}`));
  }

  if (auto_charge === true) {
    return next(
      new BadRequestError(
        'Automatic card charging is disabled in this phase. Recurring payment schedules are currently configured for Manual Due-Date Tracking.'
      )
    );
  }

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return next(new BadRequestError(`status is required and must be one of: ${VALID_STATUSES.join(', ')}`));
  }

  next();
};

module.exports = {
  validateCreateSchedule,
  validateUpdateSchedule,
  validateStatusUpdate,
};
