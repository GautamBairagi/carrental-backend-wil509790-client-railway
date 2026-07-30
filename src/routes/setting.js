const express = require('express');
const settingController = require('../controllers/setting');
const settingValidator = require('../validators/setting');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Public configuration route (unauthenticated)
router.get('/public', settingController.getPublicSettings);

router.use(authenticate);

router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), settingController.list);
router.get('/:key', authorize('ADMIN', 'OPERATIONS_MANAGER'), settingController.getByKey);
router.put('/:key', authorize('ADMIN'), settingValidator.validateUpdateSetting, settingController.update);

module.exports = router;
