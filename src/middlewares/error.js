const logger = require('../utils/logger');
const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error
  logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, { stack: err.stack });

  if (process.env.NODE_ENV === 'development') {
    return error(res, err.message, err.statusCode, {
      stack: err.stack,
    });
  }

  // Operational error (known, expected app exception)
  if (err.isOperational) {
    return error(res, err.message, err.statusCode);
  }

  // Unknown internal errors
  return error(res, 'Something went wrong on our server.', 500);
};

module.exports = errorHandler;
