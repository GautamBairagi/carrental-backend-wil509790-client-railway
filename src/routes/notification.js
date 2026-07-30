const express = require('express');
const notificationController = require('../controllers/notification');
const notificationValidator = require('../validators/notification');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// Preferences routes
router.get('/preferences', notificationController.getPref);
router.put('/preferences', notificationValidator.validatePreferenceUpdate, notificationController.updatePref);

// Counts & operations
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllRead);

// Manual scan trigger (Admins & Operations Managers only)
router.post('/scan', authorize('ADMIN', 'OPERATIONS_MANAGER'), notificationController.triggerExpiryScan);

// Individual notification paths
router.get('/', notificationController.list);
router.get('/:id', notificationController.getById);
router.patch('/:id/read', notificationController.markRead);
router.patch('/:id/archive', notificationController.archive);

module.exports = router;
