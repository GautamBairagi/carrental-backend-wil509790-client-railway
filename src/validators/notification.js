const { BadRequestError } = require('../utils/errors');

const validateNotificationAction = (req, res, next) => {
  // Simple validation block. Key actions are targeted by ID params.
  next();
};

const validatePreferenceUpdate = (req, res, next) => {
  const { bookingNotifications, paymentNotifications, deliveryNotifications, returnNotifications, systemNotifications } = req.body;

  const fields = {
    bookingNotifications,
    paymentNotifications,
    deliveryNotifications,
    returnNotifications,
    systemNotifications
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && typeof value !== 'boolean') {
      return next(new BadRequestError(`Preference field "${key}" must be a boolean value.`));
    }
  }

  next();
};

module.exports = {
  validateNotificationAction,
  validatePreferenceUpdate,
};
