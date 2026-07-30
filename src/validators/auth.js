const { BadRequestError } = require('../utils/errors');

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const validateLogin = (req, res, next) => {
  const { identifier, password } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return next(new BadRequestError('Identifier (email or username) is required.'));
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return next(new BadRequestError('Password must be at least 6 characters long.'));
  }

  next();
};

const validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return next(new BadRequestError('Current password is required.'));
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return next(new BadRequestError('New password must be at least 6 characters long.'));
  }

  next();
};

const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    return next(new BadRequestError('A valid email address is required.'));
  }

  next();
};

const validateResetPassword = (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return next(new BadRequestError('Reset token is required.'));
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return next(new BadRequestError('New password must be at least 6 characters long.'));
  }

  next();
};

module.exports = {
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
};
