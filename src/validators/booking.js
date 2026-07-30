const { BadRequestError } = require('../utils/errors');

const validateCreateBooking = (req, res, next) => {
  const {
    customerId,
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
  } = req.body;

  if (!customerId || typeof customerId !== 'string') {
    return next(new BadRequestError('Customer ID is required.'));
  }

  if (!vehicleId || typeof vehicleId !== 'string') {
    return next(new BadRequestError('Vehicle ID is required.'));
  }

  if (!pickupDate || isNaN(Date.parse(pickupDate))) {
    return next(new BadRequestError('A valid pickup date is required.'));
  }

  if (!returnDate || isNaN(Date.parse(returnDate))) {
    return next(new BadRequestError('A valid return date is required.'));
  }

  if (new Date(pickupDate) >= new Date(returnDate)) {
    return next(new BadRequestError('Return date must be after pickup date.'));
  }

  if (!pickupLocation || typeof pickupLocation !== 'string' || !pickupLocation.trim()) {
    return next(new BadRequestError('Pickup location is required.'));
  }

  if (typeof rentalDays !== 'number' || rentalDays <= 0) {
    return next(new BadRequestError('Rental days must be a positive number.'));
  }

  if (typeof subtotal !== 'number' || subtotal < 0) {
    return next(new BadRequestError('Subtotal must be a positive number.'));
  }

  if (typeof tax !== 'number' || tax < 0) {
    return next(new BadRequestError('Tax must be a positive number.'));
  }

  if (typeof fees !== 'number' || fees < 0) {
    return next(new BadRequestError('Fees must be a positive number.'));
  }

  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    return next(new BadRequestError('Total amount must be a positive number.'));
  }

  const allowedPaymentMethods = ['CREDIT_DEBIT_CARD', 'ZELLE', 'CASH_APP', 'PAY_AT_DELIVERY'];
  if (!paymentMethod || !allowedPaymentMethods.includes(paymentMethod)) {
    return next(new BadRequestError('A valid payment method (CREDIT_DEBIT_CARD, ZELLE, CASH_APP, PAY_AT_DELIVERY) is required.'));
  }

  next();
};

const validateUpdateBooking = (req, res, next) => {
  const { pickupDate, returnDate, rentalDays, subtotal, tax, fees, totalAmount, paymentMethod } = req.body;

  if (pickupDate && isNaN(Date.parse(pickupDate))) {
    return next(new BadRequestError('A valid pickup date is required.'));
  }

  if (returnDate && isNaN(Date.parse(returnDate))) {
    return next(new BadRequestError('A valid return date is required.'));
  }

  if (pickupDate && returnDate && new Date(pickupDate) >= new Date(returnDate)) {
    return next(new BadRequestError('Return date must be after pickup date.'));
  }

  const allowedPaymentMethods = ['CREDIT_DEBIT_CARD', 'ZELLE', 'CASH_APP', 'PAY_AT_DELIVERY'];
  if (paymentMethod && !allowedPaymentMethods.includes(paymentMethod)) {
    return next(new BadRequestError('Invalid payment method.'));
  }

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status, notes } = req.body;
  const validStatuses = [
    'Draft', 'Pending_Review', 'License_Verification_Pending', 'License_Verified',
    'Contract_Sent', 'Contract_Signed', 'Payment_Pending', 'Payment_Completed',
    'Driver_Assigned', 'Delivery_Scheduled', 'Vehicle_Delivered', 'Active_Rental',
    'Return_Scheduled', 'Vehicle_Returned', 'Completed', 'Cancelled', 'Rejected', 'No_Show'
  ];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError('A valid booking status is required.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Status change notes must be a string value.'));
  }

  next();
};

const validateBookingNote = (req, res, next) => {
  const { note } = req.body;

  if (!note || typeof note !== 'string' || !note.trim()) {
    return next(new BadRequestError('Note text content is required.'));
  }

  next();
};

const validateDriverAssignment = (req, res, next) => {
  const { driverId } = req.body;

  if (!driverId || typeof driverId !== 'string') {
    return next(new BadRequestError('Driver ID is required for assignment.'));
  }

  next();
};

module.exports = {
  validateCreateBooking,
  validateUpdateBooking,
  validateStatusUpdate,
  validateBookingNote,
  validateDriverAssignment,
};
