const paymentService = require('../services/payment');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const payment = await paymentService.createPayment(req.body, req.user.id);
    return success(res, 'Payment record created successfully.', { payment }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { payments, pagination } = await paymentService.getPayments(req.query, req.user.id, req.user.role);
    return success(res, 'Payments retrieved successfully.', { payments, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Payment retrieved successfully.', { payment });
  } catch (error) {
    next(error);
  }
};

const addTransaction = async (req, res, next) => {
  try {
    const payment = await paymentService.recordTransaction(req.params.id, req.body, req.user.id);
    return success(res, 'Payment transaction recorded successfully.', { payment });
  } catch (error) {
    next(error);
  }
};

const refund = async (req, res, next) => {
  try {
    const payment = await paymentService.refundPayment(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Payment refunded successfully.', { payment });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const payment = await paymentService.updatePaymentStatusManual(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Payment status updated manually.', { payment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  addTransaction,
  refund,
  updateStatus,
};
