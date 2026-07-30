const express = require('express');
const deliveryController = require('../controllers/delivery');
const deliveryValidator = require('../validators/delivery');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// List and view details of deliveries
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryController.getById);

// Create delivery (Admin and Operations Manager)
router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), deliveryValidator.validateCreateDelivery, deliveryController.create);

// Update status (Admin, Operations Manager, and Driver)
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryValidator.validateUpdateStatus, deliveryController.updateStatus);

// Add delivery inspection (Admin, Operations Manager, and Driver)
router.post('/:id/inspections', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryValidator.validateAddInspection, deliveryController.addInspection);

// Upload photos (Admin, Operations Manager, and Driver)
router.post('/:id/photos', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryValidator.validateAddPhoto, deliveryController.addPhoto);

// Capture signatures (Admin, Operations Manager, and Driver)
router.post('/:id/signatures', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryValidator.validateCaptureSignatures, deliveryController.captureSignatures);

// Update checklist item (Admin, Operations Manager, and Driver)
router.patch('/:id/checklist/:itemId', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), deliveryValidator.validateUpdateChecklistItem, deliveryController.updateChecklistItem);

module.exports = router;
