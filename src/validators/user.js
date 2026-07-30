const { BadRequestError } = require('../utils/errors');

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const validateCreateUser = (req, res, next) => {
  const { name, username, email, phone, role, status, password } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new BadRequestError('Name is required.'));
  }

  if (username && (typeof username !== 'string' || username.trim().length < 3)) {
    return next(new BadRequestError('Username must be at least 3 characters long if provided.'));
  }

  if (!email || !validateEmail(email)) {
    return next(new BadRequestError('A valid email address is required.'));
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return next(new BadRequestError('Phone number is required.'));
  }

  if (!role || !['ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'].includes(role)) {
    return next(new BadRequestError('A valid role (ADMIN, OPERATIONS_MANAGER, DRIVER) is required.'));
  }

  if (status && !['Active', 'Pending', 'Inactive'].includes(status)) {
    return next(new BadRequestError('Status must be Active, Pending, or Inactive.'));
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return next(new BadRequestError('Password must be at least 6 characters long.'));
  }

  // Driver Profile validations
  if (role === 'DRIVER') {
    const { hireDate, drivingLicenseId, licenseExpiryDate, homeAddress, emergencyContactName, emergencyContactPhone } = req.body;

    if (!hireDate || isNaN(Date.parse(hireDate))) {
      return next(new BadRequestError('A valid hire date is required for drivers.'));
    }

    if (!drivingLicenseId || typeof drivingLicenseId !== 'string' || !drivingLicenseId.trim()) {
      return next(new BadRequestError('Driving license ID is required for drivers.'));
    }

    if (!licenseExpiryDate || isNaN(Date.parse(licenseExpiryDate))) {
      return next(new BadRequestError('A valid license expiry date is required for drivers.'));
    }

    if (!homeAddress || typeof homeAddress !== 'string' || !homeAddress.trim()) {
      return next(new BadRequestError('Home address is required for drivers.'));
    }

    if (!emergencyContactName || typeof emergencyContactName !== 'string' || !emergencyContactName.trim()) {
      return next(new BadRequestError('Emergency contact name is required for drivers.'));
    }

    if (!emergencyContactPhone || typeof emergencyContactPhone !== 'string' || !emergencyContactPhone.trim()) {
      return next(new BadRequestError('Emergency contact phone is required for drivers.'));
    }
  }

  next();
};

const validateUpdateUser = (req, res, next) => {
  const { name, email, phone, role, status } = req.body;

  if (name && (typeof name !== 'string' || !name.trim())) {
    return next(new BadRequestError('Name cannot be empty.'));
  }

  if (email && !validateEmail(email)) {
    return next(new BadRequestError('A valid email address is required.'));
  }

  if (phone && (typeof phone !== 'string' || !phone.trim())) {
    return next(new BadRequestError('Phone number cannot be empty.'));
  }

  if (role && !['ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'].includes(role)) {
    return next(new BadRequestError('A valid role (ADMIN, OPERATIONS_MANAGER, DRIVER) is required.'));
  }

  if (status && !['Active', 'Pending', 'Inactive'].includes(status)) {
    return next(new BadRequestError('Status must be Active, Pending, or Inactive.'));
  }

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;

  if (!status || !['Active', 'Pending', 'Inactive'].includes(status)) {
    return next(new BadRequestError('A valid status (Active, Pending, Inactive) is required.'));
  }

  next();
};

module.exports = {
  validateCreateUser,
  validateUpdateUser,
  validateStatusUpdate,
};
