const stripe = require('../config/stripe');
const prisma = require('../config/db');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { success } = require('../utils/response');
const notificationService = require('../services/notification');

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
      const booking = await tx.booking.findUnique({
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

      return updated;
    });

    // 5. Send Notification
    try {
      const booking = await prisma.booking.findUnique({ where: { id: payment.booking_id } });
      await notificationService.createNotification({
        title: 'Payment Completed',
        message: `Stripe payment of $${payment.amount} completed for booking ${booking ? booking.booking_number : 'N/A'}.`,
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

module.exports = {
  confirmStripePayment,
};
