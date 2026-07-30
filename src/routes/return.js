const express = require('express');
const returnController = require('../controllers/return');
const returnValidator = require('../validators/return');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// List and view return records
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnController.getById);

// Get return invoice summary
router.get('/:id/summary', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnController.getSummary);

// Create scheduled return (Admin and Operations Manager)
router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), returnValidator.validateCreateReturn, returnController.create);

// Record inspection details (Admin, Operations Manager, and Driver)
router.post('/:id/inspection', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnValidator.validateAddInspection, returnController.addInspection);

// Upload return photos (Admin, Operations Manager, and Driver)
router.post('/:id/photos', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnValidator.validateAddPhoto, returnController.addPhoto);

// Capture customer/driver signatures (Admin, Operations Manager, and Driver)
router.post('/:id/signatures', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnValidator.validateCaptureSignatures, returnController.captureSignatures);

// Approve or waive damage charge (Admin only)
router.patch('/:id/charges/:chargeId/approve', authorize('ADMIN'), returnValidator.validateApproveCharge, returnController.approveDamageCharge);

// Update status (Admin, Operations Manager, and Driver)
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), returnValidator.validateUpdateStatus, returnController.updateStatus);

module.exports = router;
