const stripe = require('../config/stripe');
const prisma = require('../config/db');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { success } = require('../utils/response');
const notificationService = require('../services/notification');
const paymentService = require('../services/payment');

const confirmStripePayment = async (req, res, next) => {
  try {
    const { bookingId, paymentIntentId } = req.body;

    if (!paymentIntentId) {
      throw new BadRequestError('Payment Intent ID is required.');
    }

    // 1. Retrieve the PaymentIntent from Stripe to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestError(`Payment has not succeeded yet. Status is: ${paymentIntent.status}`);
    }

    // 2. Find the corresponding Payment record in our DB
    const payment = await prisma.payment.findFirst({
      where: {
        booking_id: bookingId,
        transaction_reference: paymentIntentId,
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment record not found for this transaction.');
    }

    // If already processed as Paid, return success immediately to prevent double processing
    if (payment.status === 'Paid') {
      return success(res, 'Payment already processed and verified.', { payment });
    }

    // 3. Find admin user for logging history
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN', is_deleted: false },
    });
    const changedByUserId = adminUser ? adminUser.id : null;

    // 4. Update DB inside a transaction
    const updatedPayment = await prisma.$transaction(async (tx) => {
      // 4a. Update Payment record to Paid
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'Paid',
          paid_amount: payment.amount,
          remaining_amount: 0.00,
          payment_date: new Date(),
        },
      });

      // 4b. Log Payment History
      await tx.paymentHistory.create({
        data: {
          payment_id: payment.id,
          old_status: payment.status,
          new_status: 'Paid',
          changed_by: changedByUserId,
          notes: 'Stripe PaymentIntent succeeded. Status updated to Paid automatically.',
        },
      });

      // 4c. Create Payment Transaction record
      await tx.paymentTransaction.create({
        data: {
          payment_id: payment.id,
          amount: payment.amount,
          payment_method: 'CREDIT_DEBIT_CARD',
          transaction_reference: paymentIntentId,
          received_by: changedByUserId,
          notes: 'Stripe integration payment received successfully.',
        },
      });

      // 4d. Retrieve booking to update its status
      let booking = null;
      if (payment.booking_id) {
        booking = await tx.booking.findUnique({
          where: { id: payment.booking_id },
        });

        if (booking) {
          await tx.booking.update({
            where: { id: payment.booking_id },
            data: {
              payment_completed: true,
              status: 'Payment_Completed',
            },
          });

          // 4e. Log Booking Status History
          await tx.bookingStatusHistory.create({
            data: {
              booking_id: payment.booking_id,
              old_status: booking.status,
              new_status: 'Payment_Completed',
              changed_by: changedByUserId,
              notes: 'Stripe payment completed in full. Booking status updated to Payment Completed.',
            },
          });
        }
      }

      return updated;
    });

    // 5. Send Notification
    try {
      let booking = null;
      if (payment.booking_id) {
        booking = await prisma.booking.findUnique({ where: { id: payment.booking_id } });
      }
      await notificationService.createNotification({
        title: 'Payment Completed',
        message: `Stripe payment of $${payment.amount} completed${booking ? ` for booking ${booking.booking_number}` : ' at back-office counter'}.`,
        type: 'PAYMENT',
        priority: 'HIGH',
        creatorId: changedByUserId,
      });
    } catch (notifError) {
      console.error('Failed to create payment notification:', notifError);
    }

    return success(res, 'Stripe payment confirmed and booking updated successfully.', { payment: updatedPayment });
  } catch (error) {
    next(error);
  }
};

const createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, currency = 'usd', bookingId, customerId, vehicleId, paymentMethod, transactionReference, notes } = req.body;

    if (!amount || amount <= 0) {
      throw new BadRequestError('Invalid amount provided.');
    }

    // Convert to cents for Stripe
    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Create DB Payment record (Pending status)
    const paymentData = {
      bookingId,
      customerId,
      vehicleId,
      amount,
      paymentMethod: paymentMethod || 'CREDIT_DEBIT_CARD',
      transactionReference: paymentIntent.id,
      notes: notes || 'Stripe intent initialized for counter payment'
    };

    // We can assume user is authenticated if they hit this, but we'll use a fallback ID just in case
    const userId = req.user?.id || (await prisma.user.findFirst({ where: { role: 'ADMIN', is_deleted: false } })).id;
    
    // This will create a pending payment in the database
    const payment = await paymentService.createPayment(paymentData, userId);

    return success(res, 'Payment Intent created successfully', {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentId: payment.id
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  confirmStripePayment,
  createPaymentIntent,
};
