const prisma = require('../config/db');
const { NotFoundError, BadRequestError } = require('../utils/errors');

/**
 * Internal helper to dispatch system notifications.
 * It respects user preferences.
 * @param {object} params - notification metadata
 * @param {string} params.title - title of the alert
 * @param {string} params.message - description of the alert
 * @param {string} params.type - Enum: BOOKING, CONTRACT, PAYMENT, DELIVERY, RETURN, VEHICLE, DRIVER, SYSTEM
 * @param {string} params.priority - Enum: LOW, MEDIUM, HIGH, CRITICAL
 * @param {string|null} params.creatorId - ID of user triggering the action
 * @param {string[]} [params.specificUserIds] - Specific user IDs to direct notification to (e.g. assigned driver)
 */
const createNotification = async ({ title, message, type, priority = 'MEDIUM', creatorId = null, specificUserIds = [] }) => {
  try {
    // Determine the preference column to check based on type
    let prefField = 'system_notifications';
    if (type === 'BOOKING') prefField = 'booking_notifications';
    else if (type === 'PAYMENT') prefField = 'payment_notifications';
    else if (type === 'DELIVERY') prefField = 'delivery_notifications';
    else if (type === 'RETURN') prefField = 'return_notifications';

    // Get all active users
    const users = await prisma.user.findMany({
      where: { is_deleted: false, status: 'Active' },
      include: { notification_preference: true },
    });

    const recipients = [];

    for (const u of users) {
      // Admins and Operations Managers always get notified by default unless muted
      const isAdminOrOps = u.role === 'ADMIN' || u.role === 'OPERATIONS_MANAGER';
      const isTargeted = specificUserIds.includes(u.id);

      if (isAdminOrOps || isTargeted) {
        // Check preferences
        let isEnabled = true;
        if (u.notification_preference) {
          isEnabled = !!u.notification_preference[prefField];
        }

        if (isEnabled) {
          recipients.push(u.id);
        }
      }
    }

    if (recipients.length === 0) return null;

    const notification = await prisma.$transaction(async (tx) => {
      const newNotification = await tx.notification.create({
        data: {
          title,
          message,
          type,
          priority,
          created_by: creatorId || null,
        },
      });

      await tx.notificationRecipient.createMany({
        data: recipients.map((userId) => ({
          notification_id: newNotification.id,
          user_id: userId,
          status: 'UNREAD',
        })),
      });

      return newNotification;
    });

    return notification;
  } catch (error) {
    console.error('Notification dispatch error:', error);
  }
};

const getNotifications = async (userId, queryFilters = {}) => {
  const { status } = queryFilters;

  const where = { user_id: userId };
  if (status) {
    where.status = status;
  } else {
    // Default show unread and read, exclude archived unless specified
    where.status = { in: ['UNREAD', 'READ'] };
  }

  return prisma.notificationRecipient.findMany({
    where,
    include: {
      notification: {
        include: {
          creator: { select: { name: true, role: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });
};

const getNotificationById = async (id, userId) => {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: { id, user_id: userId },
    include: { notification: true },
  });
  if (!recipient) {
    throw new NotFoundError('Notification not found.');
  }
  return recipient;
};

const markAsRead = async (id, userId) => {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: { id, user_id: userId },
  });
  if (!recipient) {
    throw new NotFoundError('Notification not found.');
  }

  return prisma.notificationRecipient.update({
    where: { id },
    data: {
      status: 'READ',
      read_at: new Date(),
    },
  });
};

const markAllAsRead = async (userId) => {
  return prisma.notificationRecipient.updateMany({
    where: { user_id: userId, status: 'UNREAD' },
    data: {
      status: 'READ',
      read_at: new Date(),
    },
  });
};

const archiveNotification = async (id, userId) => {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: { id, user_id: userId },
  });
  if (!recipient) {
    throw new NotFoundError('Notification not found.');
  }

  return prisma.notificationRecipient.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  });
};

const getUnreadCount = async (userId) => {
  const count = await prisma.notificationRecipient.count({
    where: { user_id: userId, status: 'UNREAD' },
  });
  return { unreadCount: count };
};

const getPreferences = async (userId) => {
  let pref = await prisma.notificationPreference.findUnique({
    where: { user_id: userId },
  });

  if (!pref) {
    pref = await prisma.notificationPreference.create({
      data: { user_id: userId },
    });
  }
  return pref;
};

const updatePreferences = async (userId, body) => {
  const { bookingNotifications, paymentNotifications, deliveryNotifications, returnNotifications, systemNotifications } = body;

  return prisma.notificationPreference.upsert({
    where: { user_id: userId },
    update: {
      booking_notifications: bookingNotifications,
      payment_notifications: paymentNotifications,
      delivery_notifications: deliveryNotifications,
      return_notifications: returnNotifications,
      system_notifications: systemNotifications,
    },
    create: {
      user_id: userId,
      booking_notifications: bookingNotifications !== undefined ? bookingNotifications : true,
      payment_notifications: paymentNotifications !== undefined ? paymentNotifications : true,
      delivery_notifications: deliveryNotifications !== undefined ? deliveryNotifications : true,
      return_notifications: returnNotifications !== undefined ? returnNotifications : true,
      system_notifications: systemNotifications !== undefined ? systemNotifications : true,
    },
  });
};

/**
 * Scanning routine that triggers notification alerts on document expiries.
 * Looks for exact remaining days: 30, 15, 7, 1.
 */
const scanExpiriesAndAlert = async () => {
  try {
    const intervals = [30, 15, 7, 1];
    const now = new Date();

    // 1. Check Vehicle Documents
    const vehicleDocs = await prisma.vehicleDocument.findMany({
      include: { vehicle: true },
    });

    for (const doc of vehicleDocs) {
      const expiry = new Date(doc.expiry_date);
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (intervals.includes(diffDays)) {
        await createNotification({
          title: `Vehicle Document Expiry Alert`,
          message: `Vehicle ${doc.vehicle.make} ${doc.vehicle.model} (${doc.vehicle.plate_number}) document "${doc.document_type}" expires in ${diffDays} day(s).`,
          type: 'VEHICLE',
          priority: diffDays <= 7 ? 'CRITICAL' : 'HIGH',
        });
      }
    }

    // 2. Check Driver Licenses
    const driverProfiles = await prisma.driverProfile.findMany({
      include: { user: true },
    });

    for (const drv of driverProfiles) {
      const expiry = new Date(drv.license_expiry_date);
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (intervals.includes(diffDays)) {
        await createNotification({
          title: `Driver License Expiry Alert`,
          message: `Driver "${drv.user.name}" driving license expires in ${diffDays} day(s).`,
          type: 'DRIVER',
          priority: diffDays <= 7 ? 'CRITICAL' : 'HIGH',
          specificUserIds: [drv.user_id],
        });
      }
    }
  } catch (error) {
    console.error('Expiry scan error:', error);
  }
};

module.exports = {
  createNotification,
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  getUnreadCount,
  getPreferences,
  updatePreferences,
  scanExpiriesAndAlert,
};
