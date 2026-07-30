const express = require('express');
const reportController = require('../controllers/report');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'OPERATIONS_MANAGER'));

router.get('/bookings', reportController.getBookings);
router.get('/revenue', reportController.getRevenue);
router.get('/vehicles', reportController.getVehicles);
router.get('/drivers', reportController.getDrivers);
router.get('/deliveries', reportController.getDeliveries);
router.get('/returns', reportController.getReturns);
router.get('/vehicle-expiry', reportController.getVehicleExpiry);
router.get('/driver-expiry', reportController.getDriverExpiry);
router.get('/dashboard', reportController.getDashboard);

module.exports = router;
