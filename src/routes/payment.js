const express = require('express');
const paymentController = require('../controllers/payment');
const paymentValidator = require('../validators/payment');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// List and view payments
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), paymentController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), paymentController.getById);

// Create payment record
router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), paymentValidator.validateCreatePayment, paymentController.create);

// Record transactions against payment
router.post('/:id/transactions', authorize('ADMIN', 'OPERATIONS_MANAGER'), paymentValidator.validateCreateTransaction, paymentController.addTransaction);

// Manual status override
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER'), paymentValidator.validateStatusUpdate, paymentController.updateStatus);

// Refund payment (ADMIN ONLY)
router.patch('/:id/refund', authorize('ADMIN'), paymentController.refund);

module.exports = router;
