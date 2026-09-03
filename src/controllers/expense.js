const expenseService = require('../services/expense');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const expense = await expenseService.createExpense(req.body, req.user.id);
    return success(res, 'Expense record created successfully.', { expense }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { expenses, pagination } = await expenseService.getExpenses(req.query);
    return success(res, 'Expenses retrieved successfully.', { expenses, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    return success(res, 'Expense details retrieved successfully.', { expense });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const expense = await expenseService.updateExpense(req.params.id, req.body, req.user.id);
    return success(res, 'Expense record updated successfully.', { expense });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await expenseService.deleteExpense(req.params.id, req.user.id);
    return success(res, 'Expense record deleted successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
};
