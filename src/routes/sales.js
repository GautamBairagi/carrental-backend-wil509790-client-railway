const express = require('express');
const router = express.Router();
const salesController = require('../controllers/sales');
const { authenticate, authorize } = require('../middlewares/auth');

// ── PUBLIC ROUTES (no auth required — landing page) ─────────────────────────

// GET /sales/cars           – List all cars for sale
router.get('/cars', salesController.getSaleCars);

// GET /sales/cars/:id       – Get one sale car details
router.get('/cars/:id', salesController.getSaleCarById);

// POST /sales/cars/:vehicleId/inquire  – Submit inquiry / reservation
router.post('/cars/:vehicleId/inquire', salesController.createInquiry);

// ── ADMIN ROUTES (auth required) ────────────────────────────────────────────

// GET /sales/stats          – Dashboard stats
router.get('/stats', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.getSaleStats);

// GET /sales/inquiries      – List all sale inquiries
router.get('/inquiries', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.listInquiries);

// GET /sales/inquiries/:id  – Get single inquiry
router.get('/inquiries/:id', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.getInquiryById);

// PATCH /sales/inquiries/:id – Update inquiry (status, notes, fee status)
router.patch('/inquiries/:id', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.updateInquiry);

// POST /sales/vehicles/:vehicleId/list    – Mark a vehicle for sale
router.post('/vehicles/:vehicleId/list', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.listVehicleForSale);

// DELETE /sales/vehicles/:vehicleId/list – Remove vehicle from sale
router.delete('/vehicles/:vehicleId/list', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.delistVehicleFromSale);

// POST /sales/vehicles/:vehicleId/sold   – Mark vehicle as SOLD
router.post('/vehicles/:vehicleId/sold', authenticate, authorize('ADMIN', 'OPERATIONS_MANAGER'), salesController.markVehicleAsSold);

module.exports = router;
