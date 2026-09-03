const prisma = require('../config/db');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const generateExpenseNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let isUnique = false;
  let expenseNumber = '';

  while (!isUnique) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    expenseNumber = `EXP-${dateStr}-${randomSuffix}`;
    const existing = await prisma.expense.findUnique({
      where: { expense_number: expenseNumber },
    });
    if (!existing) {
      isUnique = true;
    }
  }

  return expenseNumber;
};

const createExpense = async (data, creatorId) => {
  const {
    vehicle_id,
    maintenance_id,
    category,
    title,
    amount,
    expense_date,
    vendor,
    receipt_url,
    notes,
  } = data;

  // 1. Validate vehicle if provided
  if (vehicle_id) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicle_id },
    });
    if (!vehicle || vehicle.is_deleted) {
      throw new NotFoundError(`Vehicle with ID ${vehicle_id} not found.`);
    }
  }

  // 2. Validate maintenance record if provided
  if (maintenance_id) {
    const maintenance = await prisma.vehicleMaintenance.findUnique({
      where: { id: maintenance_id },
    });
    if (!maintenance) {
      throw new NotFoundError(`Maintenance record with ID ${maintenance_id} not found.`);
    }

    // 3. Maintenance belonging check: If vehicle_id is also supplied, maintenance must match vehicle
    if (vehicle_id && maintenance.vehicle_id !== vehicle_id) {
      throw new BadRequestError(
        `Maintenance record ${maintenance_id} does not belong to vehicle ${vehicle_id}.`
      );
    }
  }

  // 4. Generate unique expense number
  const expenseNumber = await generateExpenseNumber();

  // 5. Create Expense and log Audit within transaction
  const result = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        expense_number: expenseNumber,
        vehicle_id: vehicle_id || null,
        maintenance_id: maintenance_id || null,
        category,
        title,
        amount: Number(amount),
        expense_date: new Date(expense_date),
        vendor: vendor || null,
        receipt_url: receipt_url || null,
        notes: notes || null,
        created_by: creatorId,
      },
      include: {
        vehicle: {
          select: { id: true, plate_number: true, make: true, model: true, year: true, category: true },
        },
        maintenance: {
          select: { id: true, service_date: true, current_mileage: true, notes: true, cost: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create Audit Log
    await tx.auditLog.create({
      data: {
        user_id: creatorId,
        action: 'CREATE_EXPENSE',
        module: 'EXPENSE',
        record_id: expense.id,
        new_value: JSON.stringify({
          expense_number: expense.expense_number,
          amount: expense.amount,
          category: expense.category,
          vehicle_id: expense.vehicle_id,
        }),
      },
    });

    return expense;
  });

  logger.info(`Expense ${result.expense_number} created successfully by user ${creatorId}.`);
  return result;
};

const getExpenses = async (queryFilters) => {
  const {
    vehicle_id,
    category,
    start_date,
    end_date,
    maintenance_id,
    page = 1,
    limit = 20,
  } = queryFilters;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  if (vehicle_id) {
    where.vehicle_id = vehicle_id;
  }

  if (category) {
    where.category = category;
  }

  if (maintenance_id) {
    where.maintenance_id = maintenance_id;
  }

  if (start_date && end_date) {
    where.expense_date = {
      gte: new Date(start_date),
      lte: new Date(end_date),
    };
  } else if (start_date) {
    where.expense_date = {
      gte: new Date(start_date),
    };
  } else if (end_date) {
    where.expense_date = {
      lte: new Date(end_date),
    };
  }

  const [total, expenses] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { expense_date: 'desc' },
      include: {
        vehicle: {
          select: { id: true, plate_number: true, make: true, model: true, year: true, category: true },
        },
        maintenance: {
          select: { id: true, service_date: true, current_mileage: true, notes: true, cost: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    expenses,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  };
};

const getExpenseById = async (id) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      vehicle: {
        select: { id: true, plate_number: true, make: true, model: true, year: true, category: true },
      },
      maintenance: {
        select: { id: true, service_date: true, current_mileage: true, notes: true, cost: true },
      },
      creator: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!expense) {
    throw new NotFoundError(`Expense record with ID ${id} not found.`);
  }

  return expense;
};

const updateExpense = async (id, data, updaterId) => {
  const existingExpense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!existingExpense) {
    throw new NotFoundError(`Expense record with ID ${id} not found.`);
  }

  const targetVehicleId = data.vehicle_id !== undefined ? data.vehicle_id : existingExpense.vehicle_id;
  const targetMaintenanceId = data.maintenance_id !== undefined ? data.maintenance_id : existingExpense.maintenance_id;

  // Validate vehicle if specified
  if (targetVehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: targetVehicleId },
    });
    if (!vehicle || vehicle.is_deleted) {
      throw new NotFoundError(`Vehicle with ID ${targetVehicleId} not found.`);
    }
  }

  // Validate maintenance if specified
  if (targetMaintenanceId) {
    const maintenance = await prisma.vehicleMaintenance.findUnique({
      where: { id: targetMaintenanceId },
    });
    if (!maintenance) {
      throw new NotFoundError(`Maintenance record with ID ${targetMaintenanceId} not found.`);
    }

    // Safety check: maintenance must belong to the vehicle
    if (targetVehicleId && maintenance.vehicle_id !== targetVehicleId) {
      throw new BadRequestError(
        `Maintenance record ${targetMaintenanceId} does not belong to vehicle ${targetVehicleId}.`
      );
    }
  }

  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.amount !== undefined) updateData.amount = Number(data.amount);
  if (data.expense_date !== undefined) updateData.expense_date = new Date(data.expense_date);
  if (data.vehicle_id !== undefined) updateData.vehicle_id = data.vehicle_id || null;
  if (data.maintenance_id !== undefined) updateData.maintenance_id = data.maintenance_id || null;
  if (data.vendor !== undefined) updateData.vendor = data.vendor || null;
  if (data.receipt_url !== undefined) updateData.receipt_url = data.receipt_url || null;
  if (data.notes !== undefined) updateData.notes = data.notes || null;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: {
          select: { id: true, plate_number: true, make: true, model: true, year: true, category: true },
        },
        maintenance: {
          select: { id: true, service_date: true, current_mileage: true, notes: true, cost: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        user_id: updaterId,
        action: 'UPDATE_EXPENSE',
        module: 'EXPENSE',
        record_id: id,
        old_value: JSON.stringify(existingExpense),
        new_value: JSON.stringify(updated),
      },
    });

    return updated;
  });

  logger.info(`Expense ${id} updated by user ${updaterId}.`);
  return result;
};

const deleteExpense = async (id, deleterId) => {
  const existingExpense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!existingExpense) {
    throw new NotFoundError(`Expense record with ID ${id} not found.`);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Record Audit Log for financial record trace
    await tx.auditLog.create({
      data: {
        user_id: deleterId,
        action: 'DELETE_EXPENSE',
        module: 'EXPENSE',
        record_id: id,
        old_value: JSON.stringify(existingExpense),
      },
    });

    // 2. Delete expense record
    await tx.expense.delete({
      where: { id },
    });
  });

  logger.info(`Expense ${id} deleted by user ${deleterId}.`);
  return { success: true, message: 'Expense record deleted successfully.' };
};

module.exports = {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
};
