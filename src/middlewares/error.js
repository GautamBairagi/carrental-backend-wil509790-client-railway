const logger = require('../utils/logger');
const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error
  logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, { stack: err.stack });

  // Handle Prisma Known Request Errors
  if (err.code === 'P2002') {
    const target = err.meta?.target;
    const field = Array.isArray(target) ? target.join(', ') : 'field';
    return error(res, `A record with this ${field} already exists.`, 400);
  }

  if (err.name === 'PrismaClientValidationError') {
    return error(res, `Invalid data provided: ${err.message.split('\n').pop() || err.message}`, 400);
  }

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
  return error(res, err.message || 'Something went wrong on our server.', 500);
};

module.exports = errorHandler;

