const express = require('express');
const contractController = require('../controllers/contract');
const contractValidator = require('../validators/contract');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// Staff Query listings (with driver assign check inside service)
router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), contractController.list);
router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), contractController.getById);
router.get('/booking/:bookingId', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), contractController.getByBookingId);

// Creation, Sending, Viewing, and execution (Admins and Operations Managers)
router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractValidator.validateCreateContract, contractController.create);

router.patch('/:id/send', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractValidator.validateStatusNotes, contractController.send);
router.patch('/:id/view', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractController.view);
router.patch('/:id/sign', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractValidator.validateSignContract, contractController.sign);
router.patch('/:id/reject', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractValidator.validateStatusNotes, contractController.reject);
router.patch('/:id/expire', authorize('ADMIN', 'OPERATIONS_MANAGER'), contractValidator.validateStatusNotes, contractController.expire);

module.exports = router;
