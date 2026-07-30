const settingService = require('../services/setting');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const settings = await settingService.getSettings(req.user.role);
    return success(res, 'System settings retrieved successfully.', { settings });
  } catch (error) {
    next(error);
  }
};

const getByKey = async (req, res, next) => {
  try {
    const setting = await settingService.getSettingByKey(req.params.key, req.user.role);
    return success(res, 'System setting retrieved successfully.', { setting });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const setting = await settingService.updateSetting(req.params.key, req.body, req.user.id, req.user.role);
    return success(res, 'System setting updated successfully.', { setting });
  } catch (error) {
    next(error);
  }
};

const getPublicSettings = async (req, res, next) => {
  try {
    const publicSettings = await settingService.getPublicSettings();
    return success(res, 'Public settings retrieved successfully.', publicSettings);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getByKey,
  update,
  getPublicSettings,
};
