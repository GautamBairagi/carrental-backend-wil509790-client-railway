const express = require('express');
const expenseController = require('../controllers/expense');
const { validateCreateExpense, validateUpdateExpense } = require('../validators/expense');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Require authentication for all expense routes
router.use(authenticate);

// RBAC: Only ADMIN and OPERATIONS_MANAGER have expense management access
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), expenseController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), expenseController.getById);

router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateCreateExpense, expenseController.create);
router.put('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateUpdateExpense, expenseController.update);
router.patch('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateUpdateExpense, expenseController.update);
router.delete('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), expenseController.remove);

module.exports = router;
