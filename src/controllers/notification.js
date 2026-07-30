const notificationService = require('../services/notification');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const notifications = await notificationService.getNotifications(req.user.id, req.query);
    return success(res, 'Notifications retrieved successfully.', { notifications });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const notification = await notificationService.getNotificationById(req.params.id, req.user.id);
    return success(res, 'Notification retrieved successfully.', { notification });
  } catch (error) {
    next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const recipient = await notificationService.markAsRead(req.params.id, req.user.id);
    return success(res, 'Notification marked as read.', { recipient });
  } catch (error) {
    next(error);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user.id);
    return success(res, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

const archive = async (req, res, next) => {
  try {
    const recipient = await notificationService.archiveNotification(req.params.id, req.user.id);
    return success(res, 'Notification archived successfully.', { recipient });
  } catch (error) {
    next(error);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    const countData = await notificationService.getUnreadCount(req.user.id);
    return success(res, 'Unread notification count retrieved.', countData);
  } catch (error) {
    next(error);
  }
};

const getPref = async (req, res, next) => {
  try {
    const preference = await notificationService.getPreferences(req.user.id);
    return success(res, 'Preferences retrieved.', { preference });
  } catch (error) {
    next(error);
  }
};

const updatePref = async (req, res, next) => {
  try {
    const preference = await notificationService.updatePreferences(req.user.id, req.body);
    return success(res, 'Preferences updated successfully.', { preference });
  } catch (error) {
    next(error);
  }
};

const triggerExpiryScan = async (req, res, next) => {
  try {
    await notificationService.scanExpiriesAndAlert();
    return success(res, 'Expiries scan executed and alert notifications dispatched.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  markRead,
  markAllRead,
  archive,
  unreadCount,
  getPref,
  updatePref,
  triggerExpiryScan,
};
