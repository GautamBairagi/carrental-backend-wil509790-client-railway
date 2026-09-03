const recurringService = require('../services/recurringPayment');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const schedule = await recurringService.createSchedule(req.body, req.user.id);
    return success(res, 'Recurring payment schedule created successfully.', { schedule }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { schedules, pagination } = await recurringService.getSchedules(req.query);
    return success(res, 'Recurring payment schedules retrieved successfully.', { schedules, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const schedule = await recurringService.getScheduleById(req.params.id);
    return success(res, 'Recurring payment schedule details retrieved successfully.', { schedule });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const schedule = await recurringService.updateSchedule(req.params.id, req.body, req.user.id);
    return success(res, 'Recurring payment schedule updated successfully.', { schedule });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const schedule = await recurringService.updateScheduleStatus(req.params.id, status, req.user.id);
    return success(res, `Recurring payment schedule status updated to ${status} successfully.`, { schedule });
  } catch (error) {
    next(error);
  }
};

const processCycle = async (req, res, next) => {
  try {
    const result = await recurringService.processCyclePayment(req.params.id, req.body, req.user.id);
    return success(res, 'Recurring cycle payment processed and due date advanced successfully.', result);
  } catch (error) {
    next(error);
  }
};

const getOverdue = async (req, res, next) => {
  try {
    const overdueSchedules = await recurringService.getOverdueSchedules();
    return success(res, 'Overdue and due recurring payment schedules retrieved successfully.', { schedules: overdueSchedules });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  updateStatus,
  processCycle,
  getOverdue,
};
