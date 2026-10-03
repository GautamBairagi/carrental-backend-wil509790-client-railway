const express = require('express');
const recurringController = require('../controllers/recurringPayment');
const {
  validateCreateSchedule,
  validateUpdateSchedule,
  validateStatusUpdate,
} = require('../validators/recurringPayment');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Require authentication for all recurring payment routes
router.use(authenticate);

// RBAC: Only ADMIN and OPERATIONS_MANAGER have recurring payment management access
router.get('/overdue', authorize('ADMIN', 'OPERATIONS_MANAGER'), recurringController.getOverdue);
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), recurringController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), recurringController.getById);

router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateCreateSchedule, recurringController.create);
router.put('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateUpdateSchedule, recurringController.update);
router.patch('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateUpdateSchedule, recurringController.update);
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER'), validateStatusUpdate, recurringController.updateStatus);
router.post('/:id/process-cycle', authorize('ADMIN', 'OPERATIONS_MANAGER'), recurringController.processCycle);

module.exports = router;
