const express = require('express');
const bookingController = require('../controllers/booking');
const bookingValidator = require('../validators/booking');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Public booking creation endpoint (no auth required)
router.post('/public-booking', bookingController.createPublicBooking);
router.delete('/public-cancel/:id', bookingController.cancelPublicBooking);
router.post('/public-availability', bookingController.checkPublicAvailability);
router.get('/public-vehicle-dates/:vehicleId', bookingController.getVehicleBookedDates);

router.use(authenticate);

// Query list & details
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), bookingController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), bookingController.getById);

// Creation & Editing (Admin and Operations Manager)
router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), bookingValidator.validateCreateBooking, bookingController.create);
router.put('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), bookingValidator.validateUpdateBooking, bookingController.update);

// Status, Notes and Drivers Assignments (Admin and Operations Manager)
router.patch('/:id/status', authorize('ADMIN', 'OPERATIONS_MANAGER'), bookingValidator.validateStatusUpdate, bookingController.updateStatus);
router.patch('/:id/assign-driver', authorize('ADMIN', 'OPERATIONS_MANAGER'), bookingValidator.validateDriverAssignment, bookingController.assignDriver);
router.post('/:id/notes', authorize('ADMIN', 'OPERATIONS_MANAGER'), bookingValidator.validateBookingNote, bookingController.addNote);

// Soft Delete (Admin Only)
router.delete('/:id', authorize('ADMIN'), bookingController.remove);

module.exports = router;
