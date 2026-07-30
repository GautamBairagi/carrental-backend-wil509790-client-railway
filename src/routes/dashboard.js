const express = require('express');
const dashboardController = require('../controllers/dashboard');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/admin', authorize('ADMIN'), dashboardController.admin);
router.get('/operations', authorize('ADMIN', 'OPERATIONS_MANAGER'), dashboardController.operations);
router.get('/driver', authorize('ADMIN', 'DRIVER'), dashboardController.driver);
router.get('/recent-activity', authorize('ADMIN', 'OPERATIONS_MANAGER'), dashboardController.recentActivity);

module.exports = router;
