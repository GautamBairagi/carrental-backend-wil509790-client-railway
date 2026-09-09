const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});

prisma.$on('query', (e) => {
  logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
});

// Configure robust transaction timeouts for production/remote database connectivity
const origTransaction = prisma.$transaction.bind(prisma);
prisma.$transaction = function (arg, options) {
  if (typeof arg === 'function') {
    const mergedOpts = { maxWait: 15000, timeout: 30000, ...(options || {}) };
    return origTransaction(arg, mergedOpts);
  }
  return origTransaction(arg, options);
};

module.exports = prisma;
