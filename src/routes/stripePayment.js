const express = require('express');
const stripePaymentController = require('../controllers/stripePayment');

const router = express.Router();

// Public endpoint for Stripe checkout form redirect/completion verification
router.post('/confirm-stripe', stripePaymentController.confirmStripePayment);

module.exports = router;
