const express = require('express');
const prisma = require('../config/db');
const { authenticate, authorize } = require('../middlewares/auth');
const { success } = require('../utils/response');
const { BadRequestError, NotFoundError } = require('../utils/errors');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), async (req, res, next) => {
  try {
    const { email } = req.query;
    if (email) {
      const customer = await prisma.customer.findUnique({ where: { email } });
      return success(res, 'Customer retrieved successfully.', { customer });
    }
    const customers = await prisma.customer.findMany({
      orderBy: { created_at: 'desc' }
    });
    return success(res, 'Customers retrieved successfully.', { customers });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER', 'DRIVER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundError('Customer not found.');
    }
    return success(res, 'Customer retrieved successfully.', { customer });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize('ADMIN', 'OPERATIONS_MANAGER'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const fullName = body.fullName || body.full_name;
    const { email, phone, address, notes } = body;

    if (!fullName || !email || !phone) {
      throw new BadRequestError('Full name, email, and phone number are required.');
    }

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestError('A customer with this email address already exists.');
    }

    const customer = await prisma.customer.create({
      data: {
        full_name: fullName,
        email,
        phone,
        address: address || 'N/A',
        notes: notes || '',
        driving_license_front: req.body.driving_license_front || req.body.drivingLicenseFront || null,
        driving_license_back: req.body.driving_license_back || req.body.drivingLicenseBack || null
      }
    });
    return success(res, 'Customer created successfully.', { customer }, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const fullName = req.body.fullName || req.body.full_name;
    const { email, phone, address, notes } = req.body;

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Customer not found.');
    }

    if (email && email !== existing.email) {
      const emailConflict = await prisma.customer.findUnique({ where: { email } });
      if (emailConflict) {
        throw new BadRequestError('A customer with this email address already exists.');
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(fullName && { full_name: fullName }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...((req.body.driving_license_front !== undefined || req.body.drivingLicenseFront !== undefined) && {
          driving_license_front: req.body.driving_license_front || req.body.drivingLicenseFront || null
        }),
        ...((req.body.driving_license_back !== undefined || req.body.drivingLicenseBack !== undefined) && {
          driving_license_back: req.body.driving_license_back || req.body.drivingLicenseBack || null
        })
      }
    });
    return success(res, 'Customer updated successfully.', { customer });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize('ADMIN', 'OPERATIONS_MANAGER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Customer not found.');
    }

    await prisma.customer.delete({ where: { id } });
    return success(res, 'Customer deleted successfully.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;

