const dashboardService = require('../services/dashboard');
const { success } = require('../utils/response');

const admin = async (req, res, next) => {
  try {
    const data = await dashboardService.getAdminDashboard(req.user.role);
    return success(res, 'Admin Dashboard stats retrieved.', data);
  } catch (error) {
    next(error);
  }
};

const operations = async (req, res, next) => {
  try {
    const data = await dashboardService.getOperationsDashboard(req.user.role);
    return success(res, 'Operations Manager Dashboard stats retrieved.', data);
  } catch (error) {
    next(error);
  }
};

const driver = async (req, res, next) => {
  try {
    const data = await dashboardService.getDriverDashboard(req.user.id, req.user.role);
    return success(res, 'Driver Dashboard stats retrieved.', data);
  } catch (error) {
    next(error);
  }
};

const recentActivity = async (req, res, next) => {
  try {
    const data = await dashboardService.getRecentActivity(req.user.role);
    return success(res, 'Recent activity list retrieved.', data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  admin,
  operations,
  driver,
  recentActivity,
};
