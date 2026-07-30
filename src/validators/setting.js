const { BadRequestError } = require('../utils/errors');

const validateUpdateSetting = (req, res, next) => {
  const { value, description } = req.body;

  if (value === undefined || value === null) {
    return next(new BadRequestError('Setting value is required.'));
  }

  if (description && typeof description !== 'string') {
    return next(new BadRequestError('Description must be a string.'));
  }

  next();
};

module.exports = {
  validateUpdateSetting,
};
