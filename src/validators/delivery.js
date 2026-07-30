const { BadRequestError } = require('../utils/errors');

const validateCreateDelivery = (req, res, next) => {
  const { bookingId, driverId, scheduledDate, notes } = req.body;

  if (!bookingId || typeof bookingId !== 'string') {
    return next(new BadRequestError('Booking ID is required.'));
  }

  if (!driverId || typeof driverId !== 'string') {
    return next(new BadRequestError('Driver ID is required.'));
  }

  if (!scheduledDate || isNaN(Date.parse(scheduledDate))) {
    return next(new BadRequestError('Scheduled date must be a valid date string.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

const validateUpdateStatus = (req, res, next) => {
  const { status, notes } = req.body;
  const validStatuses = [
    'Pending',
    'Assigned',
    'Driver_Acknowledged',
    'En_Route',
    'Arrived',
    'Vehicle_Handover',
    'Delivered',
    'Failed',
    'Cancelled'
  ];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError(`Status must be one of: ${validStatuses.join(', ')}`));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

const validateAddInspection = (req, res, next) => {
  const { fuelLevel, mileage, vehicleCondition, damageNotes, odometerOut, fuelLevelOut } = req.body;

  if (typeof fuelLevel !== 'number' || fuelLevel < 0 || fuelLevel > 100) {
    return next(new BadRequestError('Fuel level must be a number between 0 and 100.'));
  }

  if (typeof mileage !== 'number' || mileage < 0) {
    return next(new BadRequestError('Mileage must be a non-negative number.'));
  }

  if (!vehicleCondition || typeof vehicleCondition !== 'string') {
    return next(new BadRequestError('Vehicle condition description is required.'));
  }

  if (damageNotes && typeof damageNotes !== 'string') {
    return next(new BadRequestError('Damage notes must be a string.'));
  }

  if (typeof odometerOut !== 'number' || odometerOut < 0) {
    return next(new BadRequestError('Odometer out baseline value must be a non-negative number.'));
  }

  if (typeof fuelLevelOut !== 'number' || fuelLevelOut < 0 || fuelLevelOut > 100) {
    return next(new BadRequestError('Fuel level out baseline value must be a number between 0 and 100.'));
  }

  next();
};

const validateAddPhoto = (req, res, next) => {
  const { photoType, fileUrl } = req.body;
  const validPhotoTypes = [
    'FRONT',
    'REAR',
    'LEFT',
    'RIGHT',
    'INTERIOR',
    'ODOMETER',
    'FUEL_GAUGE',
    'DAMAGE'
  ];

  if (!photoType || !validPhotoTypes.includes(photoType)) {
    return next(new BadRequestError(`Photo type must be one of: ${validPhotoTypes.join(', ')}`));
  }

  if (!fileUrl || typeof fileUrl !== 'string') {
    return next(new BadRequestError('File URL is required.'));
  }

  next();
};

const validateCaptureSignatures = (req, res, next) => {
  const { customerSignature, driverSignature, handoverTime } = req.body;

  if (!customerSignature || typeof customerSignature !== 'string') {
    return next(new BadRequestError('Customer signature is required.'));
  }

  if (!driverSignature || typeof driverSignature !== 'string') {
    return next(new BadRequestError('Driver signature is required.'));
  }

  if (handoverTime && isNaN(Date.parse(handoverTime))) {
    return next(new BadRequestError('Handover time must be a valid date string.'));
  }

  next();
};

const validateUpdateChecklistItem = (req, res, next) => {
  const { completed } = req.body;

  if (typeof completed !== 'boolean') {
    return next(new BadRequestError('Completed status must be a boolean value (true or false).'));
  }

  next();
};

module.exports = {
  validateCreateDelivery,
  validateUpdateStatus,
  validateAddInspection,
  validateAddPhoto,
  validateCaptureSignatures,
  validateUpdateChecklistItem,
};
