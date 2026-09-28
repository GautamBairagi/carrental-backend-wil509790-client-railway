const express = require('express');
const stripePaymentController = require('../controllers/stripePayment');

const router = express.Router();

// Public endpoint for Stripe checkout form redirect/completion verification
router.post('/confirm-stripe', stripePaymentController.confirmStripePayment);

// Endpoint for creating intent for admin payments
router.post('/create-intent', stripePaymentController.createPaymentIntent);

// Stripe Webhook Endpoint (handles recurring cycle payments, invoice succeeded/failed)
router.post('/webhook', stripePaymentController.handleStripeWebhook);

module.exports = router;
