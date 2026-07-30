const prisma = require('../config/db');

/**
 * Logs an action to the AuditLog table.
 * @param {string|null} userId - ID of the user performing the action
 * @param {string} action - Action description (e.g. 'User Created')
 * @param {string} module - Module affected (e.g. 'USER', 'BOOKING')
 * @param {string|null} recordId - Target record primary key ID
 * @param {object|string|null} oldValue - Previous state values
 * @param {object|string|null} newValue - Updated state values
 */
const logAction = async (userId, action, module, recordId = null, oldValue = null, newValue = null) => {
  try {
    const oldValString = oldValue ? (typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue)) : null;
    const newValString = newValue ? (typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue)) : null;

    await prisma.auditLog.create({
      data: {
        user_id: userId || null,
        action,
        module,
        record_id: recordId ? String(recordId) : null,
        old_value: oldValString,
        new_value: newValString,
      },
    });
  } catch (error) {
    // Log internally but do not crash the request lifecycle if audit log creation fails
    console.error('AuditLog Error:', error);
  }
};

module.exports = {
  logAction,
};
