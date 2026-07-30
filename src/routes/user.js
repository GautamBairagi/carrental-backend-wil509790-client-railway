const express = require('express');
const userController = require('../controllers/user');
const userValidator = require('../validators/user');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Enforce Auth and Role permissions globally on this router
router.use(authenticate);

// List and specific GETs are for ADMIN and OPERATIONS_MANAGER
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), userController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), userController.getById);

// Update user details (controller has nested logic blocking OPS from editing ADMIN)
router.put('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), userValidator.validateUpdateUser, userController.update);

// Restricted actions: Create, Delete, Change Status are ADMIN only
router.post('/', authorize('ADMIN'), userValidator.validateCreateUser, userController.create);
router.delete('/:id', authorize('ADMIN'), userController.remove);
router.patch('/:id/status', authorize('ADMIN'), userValidator.validateStatusUpdate, userController.updateStatus);

module.exports = router;
