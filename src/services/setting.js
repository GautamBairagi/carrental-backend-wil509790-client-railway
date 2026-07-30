const prisma = require('../config/db');
const auditService = require('./audit');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

const getSettings = async (currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('You do not have permission to view system settings.');
  }
  return prisma.systemSetting.findMany({
    orderBy: { setting_key: 'asc' },
  });
};

const getSettingByKey = async (key, currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('You do not have permission to view system settings.');
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { setting_key: key },
  });
  if (!setting) {
    throw new NotFoundError(`Setting key "${key}" not found.`);
  }
  return setting;
};

const updateSetting = async (key, settingBody, currentUserId, currentUserRole) => {
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Administrators are permitted to modify system configurations.');
  }

  const { value, description } = settingBody;
  const valueStr = String(value);

  const existing = await prisma.systemSetting.findUnique({
    where: { setting_key: key },
  });

  const oldValue = existing ? existing.setting_value : null;

  const setting = await prisma.systemSetting.upsert({
    where: { setting_key: key },
    update: {
      setting_value: valueStr,
      description: description !== undefined ? description : undefined,
      updated_by: currentUserId,
    },
    create: {
      setting_key: key,
      setting_value: valueStr,
      description: description || null,
      updated_by: currentUserId,
    },
  });

  // Track modification in AuditLog
  await auditService.logAction(
    currentUserId,
    'Settings Changed',
    'SETTINGS',
    setting.id,
    oldValue,
    valueStr
  );

  return setting;
};

/**
 * Helper to get setting value with fallback default.
 * Automatically casts numeric values if applicable.
 */
const getSettingWithFallback = async (key, defaultValue) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { setting_key: key },
    });
    if (!setting || setting.setting_value === undefined || setting.setting_value === null) {
      return defaultValue;
    }

    const rawVal = setting.setting_value;
    
    // Auto cast check
    if (typeof defaultValue === 'number') {
      const parsed = Number(rawVal);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    if (typeof defaultValue === 'boolean') {
      return rawVal === 'true' || rawVal === '1';
    }
    return rawVal;
  } catch (error) {
    return defaultValue;
  }
};

const getPublicSettings = async () => {
  const taxRate = await getSettingWithFallback('TAX_RATE', 8);
  const deliveryFee = await getSettingWithFallback('DELIVERY_FEE', 150);
  const platformName = await getSettingWithFallback('PLATFORM_NAME', 'AERO-DRIVE CONTROL');
  const logoUrl = await getSettingWithFallback('WEBSITE_LOGO', '');

  return {
    taxRate,
    deliveryFee,
    platformName,
    logoUrl,
  };
};

module.exports = {
  getSettings,
  getSettingByKey,
  updateSetting,
  getSettingWithFallback,
  getPublicSettings,
};
