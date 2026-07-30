const express = require('express');
const prisma = require('../config/db');
const { authenticate, authorize } = require('../middlewares/auth');
const { success } = require('../utils/response');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), async (req, res, next) => {
  try {
    const { email } = req.query;
    if (email) {
      const customer = await prisma.customer.findUnique({ where: { email } });
      return success(res, 'Customer retrieved successfully.', { customer });
    }
    const customers = await prisma.customer.findMany();
    return success(res, 'Customers retrieved successfully.', { customers });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), async (req, res, next) => {
  try {
    const { fullName, email, phone, address, notes } = req.body;
    const customer = await prisma.customer.create({
      data: {
        full_name: fullName,
        email,
        phone,
        address: address || 'N/A',
        notes: notes || ''
      }
    });
    return success(res, 'Customer created successfully.', { customer }, 201);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
