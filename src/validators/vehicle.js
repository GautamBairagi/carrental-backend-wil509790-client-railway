const { BadRequestError } = require('../utils/errors');

const validateCreateVehicle = (req, res, next) => {
  const { 
    plateNumber, vin, make, model, year, color, category, dailyRentalRate,
    transmission, seats, fuelType, topSpeed, range, horsepower, doorsCount,
    securityDeposit, minimumRentalDays, insuranceExpiry, registrationExpiry,
    lastServiceDate, nextServiceDate, media
  } = req.body;

  if (!plateNumber || typeof plateNumber !== 'string' || !plateNumber.trim()) {
    return next(new BadRequestError('Plate number is required.'));
  }

  if (!vin || typeof vin !== 'string' || !vin.trim()) {
    return next(new BadRequestError('VIN is required.'));
  }

  if (!make || typeof make !== 'string' || !make.trim()) {
    return next(new BadRequestError('Make is required.'));
  }

  if (!model || typeof model !== 'string' || !model.trim()) {
    return next(new BadRequestError('Model is required.'));
  }

  if (!year || typeof year !== 'number' || year < 1900 || year > new Date().getFullYear() + 2) {
    return next(new BadRequestError('A valid year is required.'));
  }

  if (!color || typeof color !== 'string' || !color.trim()) {
    return next(new BadRequestError('Color is required.'));
  }

  if (!category || typeof category !== 'string' || !category.trim()) {
    return next(new BadRequestError('Category is required.'));
  }

  if (!dailyRentalRate || isNaN(parseFloat(dailyRentalRate)) || parseFloat(dailyRentalRate) <= 0) {
    return next(new BadRequestError('A valid positive daily rental rate is required.'));
  }

  if (seats !== undefined && (typeof seats !== 'number' || seats <= 0)) {
    return next(new BadRequestError('Seats must be a positive number.'));
  }

  if (topSpeed !== undefined && (typeof topSpeed !== 'number' || topSpeed <= 0)) {
    return next(new BadRequestError('Top speed must be a positive number.'));
  }

  if (range !== undefined && (typeof range !== 'number' || range <= 0)) {
    return next(new BadRequestError('Range must be a positive number.'));
  }

  if (horsepower !== undefined && (typeof horsepower !== 'number' || horsepower <= 0)) {
    return next(new BadRequestError('Horsepower must be a positive number.'));
  }

  if (doorsCount !== undefined && (typeof doorsCount !== 'number' || doorsCount <= 0)) {
    return next(new BadRequestError('Doors count must be a positive number.'));
  }

  if (securityDeposit !== undefined && (typeof securityDeposit !== 'number' || securityDeposit < 0)) {
    return next(new BadRequestError('Security deposit must be a non-negative number.'));
  }

  if (minimumRentalDays !== undefined && (typeof minimumRentalDays !== 'number' || minimumRentalDays <= 0)) {
    return next(new BadRequestError('Minimum rental days must be a positive number.'));
  }

  if (insuranceExpiry && isNaN(Date.parse(insuranceExpiry))) {
    return next(new BadRequestError('Invalid insurance expiry date.'));
  }

  if (registrationExpiry && isNaN(Date.parse(registrationExpiry))) {
    return next(new BadRequestError('Invalid registration expiry date.'));
  }

  if (lastServiceDate && isNaN(Date.parse(lastServiceDate))) {
    return next(new BadRequestError('Invalid last service date.'));
  }

  if (nextServiceDate && isNaN(Date.parse(nextServiceDate))) {
    return next(new BadRequestError('Invalid next service date.'));
  }

  if (media !== undefined && !Array.isArray(media)) {
    return next(new BadRequestError('Media must be an array.'));
  }

  next();
};

const validateUpdateVehicle = (req, res, next) => {
  const { 
    year, dailyRentalRate, seats, topSpeed, range, horsepower, doorsCount,
    securityDeposit, minimumRentalDays, insuranceExpiry, registrationExpiry,
    lastServiceDate, nextServiceDate, media
  } = req.body;

  if (year && (typeof year !== 'number' || year < 1900 || year > new Date().getFullYear() + 2)) {
    return next(new BadRequestError('A valid year is required.'));
  }

  if (dailyRentalRate && (isNaN(parseFloat(dailyRentalRate)) || parseFloat(dailyRentalRate) <= 0)) {
    return next(new BadRequestError('A valid positive daily rental rate is required.'));
  }

  if (seats !== undefined && (typeof seats !== 'number' || seats <= 0)) {
    return next(new BadRequestError('Seats must be a positive number.'));
  }

  if (topSpeed !== undefined && (typeof topSpeed !== 'number' || topSpeed <= 0)) {
    return next(new BadRequestError('Top speed must be a positive number.'));
  }

  if (range !== undefined && (typeof range !== 'number' || range <= 0)) {
    return next(new BadRequestError('Range must be a positive number.'));
  }

  if (horsepower !== undefined && (typeof horsepower !== 'number' || horsepower <= 0)) {
    return next(new BadRequestError('Horsepower must be a positive number.'));
  }

  if (doorsCount !== undefined && (typeof doorsCount !== 'number' || doorsCount <= 0)) {
    return next(new BadRequestError('Doors count must be a positive number.'));
  }

  if (securityDeposit !== undefined && (typeof securityDeposit !== 'number' || securityDeposit < 0)) {
    return next(new BadRequestError('Security deposit must be a non-negative number.'));
  }

  if (minimumRentalDays !== undefined && (typeof minimumRentalDays !== 'number' || minimumRentalDays <= 0)) {
    return next(new BadRequestError('Minimum rental days must be a positive number.'));
  }

  if (insuranceExpiry && isNaN(Date.parse(insuranceExpiry))) {
    return next(new BadRequestError('Invalid insurance expiry date.'));
  }

  if (registrationExpiry && isNaN(Date.parse(registrationExpiry))) {
    return next(new BadRequestError('Invalid registration expiry date.'));
  }

  if (lastServiceDate && isNaN(Date.parse(lastServiceDate))) {
    return next(new BadRequestError('Invalid last service date.'));
  }

  if (nextServiceDate && isNaN(Date.parse(nextServiceDate))) {
    return next(new BadRequestError('Invalid next service date.'));
  }

  if (media !== undefined && !Array.isArray(media)) {
    return next(new BadRequestError('Media must be an array.'));
  }

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['Available', 'Reserved', 'In Trip', 'In_Trip', 'Maintenance', 'Out Of Service', 'Out_Of_Service'];

  if (!status || !validStatuses.includes(status)) {
    return next(new BadRequestError('A valid vehicle status is required.'));
  }

  next();
};

const validateDocument = (req, res, next) => {
  const { documentType, documentNumber, expiryDate, fileUrl } = req.body;

  if (!documentType || !['Registration', 'Insurance', 'Inspection', 'Other'].includes(documentType)) {
    return next(new BadRequestError('A valid document type (Registration, Insurance, Inspection, Other) is required.'));
  }

  if (!documentNumber || typeof documentNumber !== 'string' || !documentNumber.trim()) {
    return next(new BadRequestError('Document number is required.'));
  }

  if (!expiryDate || isNaN(Date.parse(expiryDate))) {
    return next(new BadRequestError('A valid expiry date is required.'));
  }

  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) {
    return next(new BadRequestError('File URL is required.'));
  }

  next();
};

const validateMaintenance = (req, res, next) => {
  const { serviceDate, nextServiceDate, currentMileage, nextServiceMileage } = req.body;

  if (!serviceDate || isNaN(Date.parse(serviceDate))) {
    return next(new BadRequestError('A valid service date is required.'));
  }

  if (!nextServiceDate || isNaN(Date.parse(nextServiceDate))) {
    return next(new BadRequestError('A valid next service date is required.'));
  }

  if (typeof currentMileage !== 'number' || currentMileage < 0) {
    return next(new BadRequestError('A valid positive current mileage is required.'));
  }

  if (typeof nextServiceMileage !== 'number' || nextServiceMileage < 0) {
    return next(new BadRequestError('A valid positive next service mileage is required.'));
  }

  next();
};

const validateMedia = (req, res, next) => {
  const { fileUrl } = req.body;

  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) {
    return next(new BadRequestError('File URL is required.'));
  }

  next();
};

module.exports = {
  validateCreateVehicle,
  validateUpdateVehicle,
  validateStatusUpdate,
  validateDocument,
  validateMaintenance,
  validateMedia,
};
