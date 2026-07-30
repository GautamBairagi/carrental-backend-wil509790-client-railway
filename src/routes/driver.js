const express = require('express');
const driverController = require('../controllers/driver');
const driverValidator = require('../validators/driver');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// List query endpoint (restricted to Admin & Operations Manager)
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), driverController.list);

// Resource operations endpoints (permission checks handled within the service layer)
router.get('/profile/me', authorize('DRIVER'), driverController.getMyProfile);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), driverController.getById);
router.get('/:id/compliance', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), driverController.getCompliance);
router.get('/:id/performance', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), driverController.getPerformance);
router.get('/:id/documents', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), driverController.getDocuments);

router.patch('/:id/availability', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), driverValidator.validateAvailabilityUpdate, driverController.updateAvailability);

// Document uploads (Admin & Operations Manager only)
router.post('/:id/documents', authorize('ADMIN', 'OPERATIONS_MANAGER'), driverValidator.validateDriverDocument, driverController.addDocument);

module.exports = router;
