const { BadRequestError } = require('../utils/errors');

const validateAvailabilityUpdate = (req, res, next) => {
  const { availability } = req.body;
  const validAvailabilities = ['Available', 'Busy', 'Break', 'Offline'];

  if (!availability || !validAvailabilities.includes(availability)) {
    return next(new BadRequestError('A valid availability status (Available, Busy, Break, Offline) is required.'));
  }

  next();
};

const validateDriverDocument = (req, res, next) => {
  const { documentType, fileUrl, expiryDate, notificationDaysBefore } = req.body;

  if (!documentType || typeof documentType !== 'string' || !documentType.trim()) {
    return next(new BadRequestError('Document type is required.'));
  }

  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) {
    return next(new BadRequestError('File URL is required.'));
  }

  if (!expiryDate || isNaN(Date.parse(expiryDate))) {
    return next(new BadRequestError('A valid expiry date is required.'));
  }

  if (notificationDaysBefore && (typeof notificationDaysBefore !== 'number' || notificationDaysBefore < 0)) {
    return next(new BadRequestError('Notification days before must be a positive integer.'));
  }

  next();
};

module.exports = {
  validateAvailabilityUpdate,
  validateDriverDocument,
};
