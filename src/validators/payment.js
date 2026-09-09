const { BadRequestError } = require('../utils/errors');

const validateCreatePayment = (req, res, next) => {
  const { bookingId, customerId, vehicleId, amount, paymentMethod, notes } = req.body;

  if (bookingId) {
    if (typeof bookingId !== 'string') {
      return next(new BadRequestError('Booking ID must be a string.'));
    }
  } else {
    // Standalone Payment validation
    if (!customerId || typeof customerId !== 'string') {
      return next(new BadRequestError('Customer ID is required for standalone payments without a booking.'));
    }
    if (!vehicleId || typeof vehicleId !== 'string') {
      return next(new BadRequestError('Vehicle ID is required for standalone payments without a booking.'));
    }
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return next(new BadRequestError('Amount must be a positive number.'));
  }

  const allowedPaymentMethods = ['CREDIT_DEBIT_CARD', 'ZELLE', 'CASH_APP', 'PAY_AT_DELIVERY', 'CASH', 'BANK_TRANSFER'];
  if (!paymentMethod || !allowedPaymentMethods.includes(paymentMethod)) {
    return next(new BadRequestError('A valid payment method (CREDIT_DEBIT_CARD, ZELLE, CASH_APP, PAY_AT_DELIVERY, CASH, BANK_TRANSFER) is required.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

const validateCreateTransaction = (req, res, next) => {
  const { amount, paymentMethod, transactionReference, proofImageUrl, notes } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    return next(new BadRequestError('Amount must be a positive number.'));
  }

  const allowedPaymentMethods = ['CREDIT_DEBIT_CARD', 'ZELLE', 'CASH_APP', 'PAY_AT_DELIVERY', 'CASH', 'BANK_TRANSFER'];
  if (!paymentMethod || !allowedPaymentMethods.includes(paymentMethod)) {
    return next(new BadRequestError('A valid payment method (CREDIT_DEBIT_CARD, ZELLE, CASH_APP, PAY_AT_DELIVERY, CASH, BANK_TRANSFER) is required.'));
  }

  if (transactionReference && typeof transactionReference !== 'string') {
    return next(new BadRequestError('Transaction reference must be a string.'));
  }

  if (proofImageUrl && typeof proofImageUrl !== 'string') {
    return next(new BadRequestError('Proof image URL must be a string.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status, notes } = req.body;
  const validStatuses = ['Pending', 'Authorized', 'Paid', 'Partially_Paid', 'Refunded', 'Failed', 'Cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError('A valid payment status is required.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

module.exports = {
  validateCreatePayment,
  validateCreateTransaction,
  validateStatusUpdate,
};
