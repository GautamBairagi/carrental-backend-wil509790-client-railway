const { BadRequestError } = require('../utils/errors');

const VALID_CATEGORIES = [
  'MAINTENANCE',
  'FUEL',
  'INSURANCE',
  'CLEANING',
  'REPAIR',
  'OPERATIONAL',
  'OTHER',
];

const validateCreateExpense = (req, res, next) => {
  const { title, category, amount, expense_date, vehicle_id, maintenance_id, vendor, receipt_url, notes } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new BadRequestError('Title is required and must be a non-empty string.'));
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return next(new BadRequestError(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return next(new BadRequestError('Amount must be a positive number greater than 0.'));
  }

  if (!expense_date || isNaN(Date.parse(expense_date))) {
    return next(new BadRequestError('A valid expense_date is required.'));
  }

  if (vehicle_id && typeof vehicle_id !== 'string') {
    return next(new BadRequestError('vehicle_id must be a string.'));
  }

  if (maintenance_id && typeof maintenance_id !== 'string') {
    return next(new BadRequestError('maintenance_id must be a string.'));
  }

  if (vendor && typeof vendor !== 'string') {
    return next(new BadRequestError('vendor must be a string.'));
  }

  if (receipt_url && typeof receipt_url !== 'string') {
    return next(new BadRequestError('receipt_url must be a string.'));
  }

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('notes must be a string.'));
  }

  next();
};

const validateUpdateExpense = (req, res, next) => {
  const { title, category, amount, expense_date, vehicle_id, maintenance_id, vendor, receipt_url, notes } = req.body;

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return next(new BadRequestError('Title must be a non-empty string.'));
  }

  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return next(new BadRequestError(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`));
  }

  if (amount !== undefined) {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return next(new BadRequestError('Amount must be a positive number greater than 0.'));
    }
  }

  if (expense_date !== undefined && isNaN(Date.parse(expense_date))) {
    return next(new BadRequestError('expense_date must be a valid date.'));
  }

  if (vehicle_id !== undefined && vehicle_id !== null && typeof vehicle_id !== 'string') {
    return next(new BadRequestError('vehicle_id must be a string or null.'));
  }

  if (maintenance_id !== undefined && maintenance_id !== null && typeof maintenance_id !== 'string') {
    return next(new BadRequestError('maintenance_id must be a string or null.'));
  }

  next();
};

module.exports = {
  validateCreateExpense,
  validateUpdateExpense,
};
