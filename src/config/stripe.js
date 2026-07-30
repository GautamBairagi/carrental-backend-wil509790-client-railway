const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not defined in the environment variables.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

module.exports = stripe;
// Trigger nodemon environment reload

