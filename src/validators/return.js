const { BadRequestError } = require('../utils/errors');

const validateCreateReturn = (req, res, next) => {
  const { bookingId, driverId, scheduledReturnDate } = req.body;

  if (!bookingId || typeof bookingId !== 'string') {
    return next(new BadRequestError('Booking ID is required.'));
  }

  if (!driverId || typeof driverId !== 'string') {
    return next(new BadRequestError('Driver ID is required.'));
  }

  if (!scheduledReturnDate || isNaN(Date.parse(scheduledReturnDate))) {
    return next(new BadRequestError('Scheduled return date must be a valid date string.'));
  }

  next();
};

const validateAddInspection = (req, res, next) => {
  const { odometerIn, fuelLevelIn, vehicleCondition, damageNotes } = req.body;

  if (typeof odometerIn !== 'number' || odometerIn < 0) {
    return next(new BadRequestError('Odometer in must be a non-negative number.'));
  }

  if (typeof fuelLevelIn !== 'number' || fuelLevelIn < 0 || fuelLevelIn > 100) {
    return next(new BadRequestError('Fuel level in must be a number between 0 and 100.'));
  }

  if (!vehicleCondition || typeof vehicleCondition !== 'string') {
    return next(new BadRequestError('Vehicle condition description is required.'));
  }

  if (damageNotes && typeof damageNotes !== 'string') {
    return next(new BadRequestError('Damage notes must be a string.'));
  }

  next();
};

const validateAddPhoto = (req, res, next) => {
  const { photoType, fileUrl } = req.body;
  const validPhotoTypes = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'INTERIOR', 'ODOMETER', 'DAMAGE'];

  if (!photoType || !validPhotoTypes.includes(photoType)) {
    return next(new BadRequestError(`Photo type must be one of: ${validPhotoTypes.join(', ')}`));
  }

  if (!fileUrl || typeof fileUrl !== 'string') {
    return next(new BadRequestError('File URL is required.'));
  }

  next();
};

const validateCaptureSignatures = (req, res, next) => {
  const { customerSignature, driverSignature } = req.body;

  if (!customerSignature || typeof customerSignature !== 'string') {
    return next(new BadRequestError('Customer signature is required.'));
  }

  if (!driverSignature || typeof driverSignature !== 'string') {
    return next(new BadRequestError('Driver signature is required.'));
  }

  next();
};

const validateUpdateStatus = (req, res, next) => {
  const { status, notes } = req.body;
  const validStatuses = ['Scheduled', 'In_Progress', 'Inspection_Completed', 'Charges_Pending', 'Completed'];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError(`Status must be one of: ${validStatuses.join(', ')}`));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Notes must be a string.'));
  }

  next();
};

const validateApproveCharge = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['Approved', 'Waived'];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError('Status must be Approved or Waived.'));
  }

  next();
};

module.exports = {
  validateCreateReturn,
  validateAddInspection,
  validateAddPhoto,
  validateCaptureSignatures,
  validateUpdateStatus,
  validateApproveCharge,
};
