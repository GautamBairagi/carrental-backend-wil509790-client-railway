const express = require('express');
const vehicleController = require('../controllers/vehicle');
const vehicleValidator = require('../validators/vehicle');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Public endpoints (no authentication required)
router.get('/', vehicleController.list);
router.get('/:id', vehicleController.getById);
router.get('/:id/media', vehicleController.getMedia);

// Enforce authentication for the remaining endpoints
router.use(authenticate);

// Write/Edit endpoints (Admin Only)
router.post('/', authorize('ADMIN'), vehicleValidator.validateCreateVehicle, vehicleController.create);
router.put('/:id', authorize('ADMIN'), vehicleValidator.validateUpdateVehicle, vehicleController.update);
router.delete('/:id', authorize('ADMIN'), vehicleController.remove);

// Operational/Fleet update endpoints (Admin and Operations Manager)
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleValidator.validateStatusUpdate, vehicleController.updateStatus);

router.post('/:id/documents', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleValidator.validateDocument, vehicleController.addDocument);
router.get('/:id/documents', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleController.getDocuments);

router.post('/:id/maintenance', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleValidator.validateMaintenance, vehicleController.addMaintenance);
router.get('/:id/maintenance', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleController.getMaintenance);

router.post('/:id/media', authorize('ADMIN', 'OPERATIONS_MANAGER'), vehicleValidator.validateMedia, vehicleController.addMedia);

module.exports = router;
