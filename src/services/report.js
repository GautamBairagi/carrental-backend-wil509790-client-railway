const prisma = require('../config/db');
const { ForbiddenError } = require('../utils/errors');

const assertReportAccess = (currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('You do not have permission to view report dashboards.');
  }
};

const getBookingsReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const { startDate, endDate, driverId, vehicleId, customerId } = queryFilters;

  const where = { is_deleted: false };

  if (startDate && endDate) {
    where.pickup_date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  if (driverId) {
    where.assigned_driver_id = driverId;
  }

  if (vehicleId) {
    where.vehicle_id = vehicleId;
  }

  if (customerId) {
    where.customer_id = customerId;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      customer: { select: { full_name: true, email: true } },
      vehicle: { select: { make: true, model: true, plate_number: true } },
      assigned_driver: { include: { user: { select: { name: true } } } },
    },
    orderBy: { created_at: 'desc' },
  });

  const totals = {
    Total: bookings.length,
    Pending: bookings.filter(b => b.status === 'Pending_Review').length,
    Active: bookings.filter(b => b.status === 'Active_Rental').length,
    Completed: bookings.filter(b => b.status === 'Completed').length,
    Cancelled: bookings.filter(b => b.status === 'Cancelled').length,
  };

  return { totals, bookings };
};

// ============================================================
// HELPER: Deduplicated Expense Calculation
// Maintenance Deduplication Safety Rule:
// If an Expense record is linked to a VehicleMaintenance record via maintenance_id,
// the maintenance cost is counted ONLY ONCE through Expense.amount.
// VehicleMaintenance.cost is added separately ONLY IF it is NOT linked to any Expense record.
// ============================================================
const getDeduplicatedExpenses = async (whereExpense, whereMaintenance) => {
  const expenses = await prisma.expense.findMany({
    where: whereExpense,
    include: {
      vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
      maintenance: { select: { id: true, service_date: true, current_mileage: true, cost: true } },
    },
    orderBy: { expense_date: 'desc' },
  });

  // Track all maintenance_id values that are already accounted for in Expenses
  const linkedMaintenanceIds = new Set(
    expenses.filter((e) => e.maintenance_id).map((e) => e.maintenance_id)
  );

  const maintenances = await prisma.vehicleMaintenance.findMany({
    where: whereMaintenance,
    include: {
      vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
    },
    orderBy: { service_date: 'desc' },
  });

  // Filter for unlinked maintenance records that have a non-zero cost
  const unlinkedMaintenances = maintenances.filter(
    (m) => Number(m.cost) > 0 && !linkedMaintenanceIds.has(m.id)
  );

  let directExpenseTotal = 0;
  expenses.forEach((e) => {
    directExpenseTotal += Number(e.amount);
  });

  let unlinkedMaintenanceTotal = 0;
  unlinkedMaintenances.forEach((m) => {
    unlinkedMaintenanceTotal += Number(m.cost);
  });

  const totalExpenses = directExpenseTotal + unlinkedMaintenanceTotal;

  return {
    totalExpenses: Number(totalExpenses.toFixed(2)),
    directExpenseTotal: Number(directExpenseTotal.toFixed(2)),
    unlinkedMaintenanceTotal: Number(unlinkedMaintenanceTotal.toFixed(2)),
    expenses,
    unlinkedMaintenances,
  };
};

const getFinancialReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const { start_date, end_date, customer_id, vehicle_id, startDate, endDate } = queryFilters;

  const sDate = start_date || startDate;
  const eDate = end_date || endDate;

  // 1. Transaction filter for collected revenue
  const whereTx = {};
  if (sDate && eDate) {
    whereTx.created_at = {
      gte: new Date(new Date(sDate).setHours(0, 0, 0, 0)),
      lte: new Date(new Date(eDate).setHours(23, 59, 59, 999)),
    };
  }

  const transactions = await prisma.paymentTransaction.findMany({
    where: whereTx,
    include: {
      payment: {
        include: {
          customer: { select: { id: true, full_name: true, email: true } },
          vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
          booking: {
            include: {
              vehicle: { select: { id: true, make: true, model: true, plate_number: true } },
            },
          },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  // Filter valid transactions (excluding failed/cancelled payments) and apply customer/vehicle filters
  let validTransactions = transactions.filter(
    (t) => t.payment && t.payment.status !== 'Failed' && t.payment.status !== 'Cancelled'
  );

  if (customer_id) {
    validTransactions = validTransactions.filter((t) => t.payment.customer_id === customer_id);
  }

  if (vehicle_id) {
    validTransactions = validTransactions.filter((t) => 
      t.payment.vehicle_id === vehicle_id || (t.payment.booking && t.payment.booking.vehicle_id === vehicle_id)
    );
  }

  const totalRevenue = Number(
    validTransactions.reduce((sum, t) => sum + Number(t.amount), 0).toFixed(2)
  );

  // 2. Outstanding Balance filter
  const wherePayment = {};
  if (customer_id) wherePayment.customer_id = customer_id;

  const pendingPayments = await prisma.payment.findMany({
    where: {
      ...wherePayment,
      status: { in: ['Pending', 'Authorized', 'Partially_Paid'] },
    },
    include: {
      booking: { select: { vehicle_id: true } },
    },
  });

  let filteredPendingPayments = pendingPayments;
  if (vehicle_id) {
    filteredPendingPayments = pendingPayments.filter((p) => p.booking && p.booking.vehicle_id === vehicle_id);
  }

  const outstandingBalance = Number(
    filteredPendingPayments.reduce((sum, p) => sum + Number(p.remaining_amount), 0).toFixed(2)
  );

  // 3. Deduplicated Expenses calculation
  const whereExpense = {};
  const whereMaintenance = {};

  if (sDate && eDate) {
    const gteDate = new Date(new Date(sDate).setHours(0, 0, 0, 0));
    const lteDate = new Date(new Date(eDate).setHours(23, 59, 59, 999));
    whereExpense.expense_date = { gte: gteDate, lte: lteDate };
    whereMaintenance.service_date = { gte: gteDate, lte: lteDate };
  }

  if (vehicle_id) {
    whereExpense.vehicle_id = vehicle_id;
    whereMaintenance.vehicle_id = vehicle_id;
  }

  const { totalExpenses, expenses, unlinkedMaintenances } = await getDeduplicatedExpenses(
    whereExpense,
    whereMaintenance
  );

  // 4. Net Profit calculation
  const netProfit = Number((totalRevenue - totalExpenses).toFixed(2));

  // 5. Groupings & Breakdowns
  // A. Revenue by Date
  const revenueByDateMap = {};
  validTransactions.forEach((t) => {
    const d = new Date(t.created_at).toISOString().split('T')[0];
    revenueByDateMap[d] = (revenueByDateMap[d] || 0) + Number(t.amount);
  });
  const revenueByDate = Object.keys(revenueByDateMap)
    .sort()
    .map((date) => ({ date, revenue: Number(revenueByDateMap[date].toFixed(2)) }));

  // B. Revenue by Customer
  const revenueByCustomerMap = {};
  validTransactions.forEach((t) => {
    const c = t.payment.customer;
    if (c) {
      if (!revenueByCustomerMap[c.id]) {
        revenueByCustomerMap[c.id] = {
          customerId: c.id,
          customerName: c.full_name,
          email: c.email,
          totalRevenue: 0,
          transactionCount: 0,
        };
      }
      revenueByCustomerMap[c.id].totalRevenue += Number(t.amount);
      revenueByCustomerMap[c.id].transactionCount += 1;
    }
  });
  const revenueByCustomer = Object.values(revenueByCustomerMap).map((c) => ({
    ...c,
    totalRevenue: Number(c.totalRevenue.toFixed(2)),
  }));

  // C. Revenue by Vehicle
  const revenueByVehicleMap = {};
  validTransactions.forEach((t) => {
    const v = t.payment.vehicle || (t.payment.booking ? t.payment.booking.vehicle : null);
    if (v) {
      if (!revenueByVehicleMap[v.id]) {
        revenueByVehicleMap[v.id] = {
          vehicleId: v.id,
          vehicleName: `${v.make} ${v.model}`,
          plateNumber: v.plate_number,
          totalRevenue: 0,
          transactionCount: 0,
        };
      }
      revenueByVehicleMap[v.id].totalRevenue += Number(t.amount);
      revenueByVehicleMap[v.id].transactionCount += 1;
    }
  });
  const revenueByVehicle = Object.values(revenueByVehicleMap).map((v) => ({
    ...v,
    totalRevenue: Number(v.totalRevenue.toFixed(2)),
  }));

  // D. Expenses by Date
  const expensesByDateMap = {};
  expenses.forEach((e) => {
    const d = new Date(e.expense_date).toISOString().split('T')[0];
    expensesByDateMap[d] = (expensesByDateMap[d] || 0) + Number(e.amount);
  });
  unlinkedMaintenances.forEach((m) => {
    const d = new Date(m.service_date).toISOString().split('T')[0];
    expensesByDateMap[d] = (expensesByDateMap[d] || 0) + Number(m.cost);
  });
  const expensesByDate = Object.keys(expensesByDateMap)
    .sort()
    .map((date) => ({ date, expense: Number(expensesByDateMap[date].toFixed(2)) }));

  // E. Expenses by Vehicle
  const expensesByVehicleMap = {};
  expenses.forEach((e) => {
    const v = e.vehicle;
    if (v) {
      if (!expensesByVehicleMap[v.id]) {
        expensesByVehicleMap[v.id] = {
          vehicleId: v.id,
          vehicleName: `${v.make} ${v.model}`,
          plateNumber: v.plate_number,
          totalExpense: 0,
        };
      }
      expensesByVehicleMap[v.id].totalExpense += Number(e.amount);
    }
  });
  unlinkedMaintenances.forEach((m) => {
    const v = m.vehicle;
    if (v) {
      if (!expensesByVehicleMap[v.id]) {
        expensesByVehicleMap[v.id] = {
          vehicleId: v.id,
          vehicleName: `${v.make} ${v.model}`,
          plateNumber: v.plate_number,
          totalExpense: 0,
        };
      }
      expensesByVehicleMap[v.id].totalExpense += Number(m.cost);
    }
  });
  const expensesByVehicle = Object.values(expensesByVehicleMap).map((v) => ({
    ...v,
    totalExpense: Number(v.totalExpense.toFixed(2)),
  }));

  // F. Expenses by Category
  const expensesByCategoryMap = {};
  expenses.forEach((e) => {
    const cat = e.category || 'OTHER';
    if (!expensesByCategoryMap[cat]) {
      expensesByCategoryMap[cat] = { category: cat, totalExpense: 0, count: 0 };
    }
    expensesByCategoryMap[cat].totalExpense += Number(e.amount);
    expensesByCategoryMap[cat].count += 1;
  });
  if (unlinkedMaintenances.length > 0) {
    if (!expensesByCategoryMap['MAINTENANCE']) {
      expensesByCategoryMap['MAINTENANCE'] = { category: 'MAINTENANCE', totalExpense: 0, count: 0 };
    }
    unlinkedMaintenances.forEach((m) => {
      expensesByCategoryMap['MAINTENANCE'].totalExpense += Number(m.cost);
      expensesByCategoryMap['MAINTENANCE'].count += 1;
    });
  }
  const expensesByCategory = Object.values(expensesByCategoryMap).map((c) => ({
    ...c,
    totalExpense: Number(c.totalExpense.toFixed(2)),
  }));

  return {
    metrics: {
      totalRevenue,
      totalExpenses,
      netProfit,
      outstandingBalance,
    },
    revenueByDate,
    revenueByCustomer,
    revenueByVehicle,
    expensesByDate,
    expensesByVehicle,
    expensesByCategory,
    validTransactions,
    expenses,
    unlinkedMaintenances,
  };
};

const getRevenueReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const financial = await getFinancialReport(queryFilters, currentUserRole);

  // Preserve existing payments format for backward compatibility
  const { startDate, endDate, paymentMethod } = queryFilters;
  const where = {};
  if (startDate && endDate) {
    where.created_at = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }
  if (paymentMethod) {
    where.payment_method = paymentMethod;
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      booking: { select: { booking_number: true } },
      customer: { select: { full_name: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return {
    metrics: {
      totalRevenue: financial.metrics.totalRevenue,
      totalExpenses: financial.metrics.totalExpenses,
      netProfit: financial.metrics.netProfit,
      outstandingBalance: financial.metrics.outstandingBalance,
      refundTotals: 0,
    },
    dailyTrend: financial.revenueByDate,
    payments,
    breakdowns: {
      revenueByCustomer: financial.revenueByCustomer,
      revenueByVehicle: financial.revenueByVehicle,
      expensesByCategory: financial.expensesByCategory,
    },
  };
};

const getVehiclePerformanceReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const { start_date, end_date, vehicle_id, startDate, endDate } = queryFilters;
  const sDate = start_date || startDate;
  const eDate = end_date || endDate;

  const whereVehicle = { is_deleted: false };
  if (vehicle_id) {
    whereVehicle.id = vehicle_id;
  }

  const vehicles = await prisma.vehicle.findMany({
    where: whereVehicle,
    include: {
      bookings: {
        where: { is_deleted: false },
        include: {
          customer: { select: { full_name: true, email: true } },
        },
      },
    },
  });

  // Date range for metrics
  const now = new Date();
  const periodStart = sDate ? new Date(sDate) : new Date(now.getFullYear(), 0, 1); // Default to start of current year
  const periodEnd = eDate ? new Date(eDate) : new Date();

  // Total period days calculation
  const totalPeriodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const totalPeriodDays = Math.ceil(totalPeriodMs / (1000 * 60 * 60 * 24));

  // Fetch all transactions in period
  const transactions = await prisma.paymentTransaction.findMany({
    where: {
      created_at: { gte: periodStart, lte: periodEnd },
    },
    include: {
      payment: {
        select: { booking_id: true, vehicle_id: true, status: true },
      },
    },
  });
  const validTransactions = transactions.filter(
    (t) => t.payment && t.payment.status !== 'Failed' && t.payment.status !== 'Cancelled'
  );

  // Fetch expenses in period
  const expenses = await prisma.expense.findMany({
    where: {
      expense_date: { gte: periodStart, lte: periodEnd },
    },
  });
  const linkedMaintenanceIds = new Set(
    expenses.filter((e) => e.maintenance_id).map((e) => e.maintenance_id)
  );

  // Fetch vehicle maintenance in period
  const maintenances = await prisma.vehicleMaintenance.findMany({
    where: {
      service_date: { gte: periodStart, lte: periodEnd },
    },
  });
  const unlinkedMaintenances = maintenances.filter(
    (m) => Number(m.cost) > 0 && !linkedMaintenanceIds.has(m.id)
  );

  const vehiclePerformanceList = vehicles.map((vehicle) => {
    // 1. Vehicle Revenue
    const vehicleBookings = vehicle.bookings || [];
    const bookingIds = new Set(vehicleBookings.map((b) => b.id));

    const vTransactions = validTransactions.filter(
      (t) => t.payment && (t.payment.vehicle_id === vehicle.id || (t.payment.booking_id && bookingIds.has(t.payment.booking_id)))
    );
    const vehicleRevenue = Number(
      vTransactions.reduce((sum, t) => sum + Number(t.amount), 0).toFixed(2)
    );

    // 2. Vehicle Expenses (deduplicated)
    const vExpenses = expenses.filter((e) => e.vehicle_id === vehicle.id);
    const vDirectExpenseSum = vExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const vUnlinkedMaint = unlinkedMaintenances.filter((m) => m.vehicle_id === vehicle.id);
    const vMaintUnlinkedSum = vUnlinkedMaint.reduce((sum, m) => sum + Number(m.cost), 0);

    const vehicleExpenses = Number((vDirectExpenseSum + vMaintUnlinkedSum).toFixed(2));

    // 3. Vehicle Net Profit
    const netProfit = Number((vehicleRevenue - vehicleExpenses).toFixed(2));

    // 4. Monthly Revenue Buckets
    const monthlyRevenueMap = {};
    vTransactions.forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
      monthlyRevenueMap[key] = (monthlyRevenueMap[key] || 0) + Number(t.amount);
    });
    const monthlyRevenue = Object.keys(monthlyRevenueMap).map((month) => ({
      month,
      revenue: Number(monthlyRevenueMap[month].toFixed(2)),
    }));

    // 5. Currently Assigned Customer
    const activeBooking = vehicleBookings.find(
      (b) => b.status === 'Active_Rental' || b.status === 'Vehicle_Delivered' || b.status === 'In_Trip'
    );
    const assignedCustomer = activeBooking && activeBooking.customer ? activeBooking.customer.full_name : null;

    // 6. Utilization Rate Calculation
    let rentedDays = 0;
    vehicleBookings.forEach((b) => {
      const pDate = new Date(b.pickup_date);
      const rDate = new Date(b.return_date);
      if (rDate >= periodStart && pDate <= periodEnd) {
        const overlapStart = pDate < periodStart ? periodStart : pDate;
        const overlapEnd = rDate > periodEnd ? periodEnd : rDate;
        const diffMs = Math.max(0, overlapEnd.getTime() - overlapStart.getTime());
        rentedDays += Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
    });

    const rawUtilization = totalPeriodDays > 0 ? (rentedDays / totalPeriodDays) * 100 : 0;
    const utilization = Number(Math.min(100, Math.max(0, rawUtilization)).toFixed(2));

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plate_number,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category,
      status: vehicle.status,
      revenue: vehicleRevenue,
      expenses: vehicleExpenses,
      netProfit,
      paymentCount: vTransactions.length,
      monthlyRevenue,
      assignedCustomer,
      utilization,
    };
  });

  return {
    period: {
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
      totalDays: totalPeriodDays,
    },
    vehicles: vehiclePerformanceList,
  };
};

const getVehicleReport = async (currentUserRole) => {
  assertReportAccess(currentUserRole);

  const performance = await getVehiclePerformanceReport({}, currentUserRole);
  const vehicles = performance.vehicles;

  const totalCount = vehicles.length;
  const statusCounts = {
    Available: vehicles.filter((v) => v.status === 'Available').length,
    Reserved: vehicles.filter((v) => v.status === 'Reserved').length,
    In_Trip: vehicles.filter((v) => v.status === 'In_Trip').length,
    Maintenance: vehicles.filter((v) => v.status === 'Maintenance').length,
  };

  const utilizationRate = totalCount > 0 ? (statusCounts.In_Trip / totalCount) * 100 : 0;

  const sortedVehicles = [...vehicles].sort((a, b) => b.revenue - a.revenue);
  const mostBooked = sortedVehicles.slice(0, 5);
  const leastUsed = [...vehicles].sort((a, b) => a.revenue - b.revenue).slice(0, 5);

  return {
    metrics: {
      totalCount,
      statusCounts,
      utilizationRate: Number(utilizationRate.toFixed(2)),
    },
    mostBooked,
    leastUsed,
    vehicles,
  };
};

const getDriverReport = async (currentUserRole) => {
  assertReportAccess(currentUserRole);

  const drivers = await prisma.driverProfile.findMany({
    include: {
      user: { select: { name: true, phone: true } },
    },
  });

  const metrics = {
    totalDrivers: drivers.length,
    Available: drivers.filter(d => d.availability === 'Available').length,
    Busy: drivers.filter(d => d.availability === 'Busy').length,
    Offline: drivers.filter(d => d.availability === 'Offline').length,
  };

  const driverPerformance = drivers.map(d => ({
    driverId: d.id,
    name: d.user.name,
    totalAssignments: d.total_assignments,
    completedAssignments: d.completed_assignments,
    cancellationPercent: d.total_assignments > 0 ? Number(((d.cancelled_assignments / d.total_assignments) * 100).toFixed(2)) : 0,
    averageRating: Number(d.average_rating),
    onTimePercent: Number(d.on_time_percentage),
  }));

  return {
    metrics,
    driverPerformance,
  };
};

const getDeliveryReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const { startDate, endDate } = queryFilters;
  const where = {};
  if (startDate && endDate) {
    where.created_at = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const deliveries = await prisma.delivery.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });

  const total = deliveries.length;
  const statusCounts = {
    Scheduled: deliveries.filter(d => d.status === 'Assigned').length,
    Completed: deliveries.filter(d => d.status === 'Delivered').length,
    Failed: deliveries.filter(d => d.status === 'Failed').length,
    EnRoute: deliveries.filter(d => d.status === 'En_Route').length,
  };

  const delayed = deliveries.filter(d => {
    return d.actual_delivery_time && new Date(d.actual_delivery_time) > new Date(d.scheduled_date);
  }).length;

  return {
    metrics: {
      total,
      statusCounts,
      delayed,
    },
    deliveries,
  };
};

const getReturnReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const { startDate, endDate } = queryFilters;
  const where = {};
  if (startDate && endDate) {
    where.created_at = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const returns = await prisma.vehicleReturn.findMany({
    where,
    include: {
      charges: true,
      inspections: true,
    },
    orderBy: { created_at: 'desc' },
  });

  const total = returns.length;
  const statusCounts = {
    Completed: returns.filter(r => r.status === 'Completed').length,
    Pending: returns.filter(r => r.status !== 'Completed').length,
  };

  let damageIncidents = 0;
  let fuelChargesSum = 0;
  let mileageChargesSum = 0;
  let lateChargesSum = 0;

  returns.forEach((r) => {
    const hasDamage = r.inspections.some(ins => ins.damage_notes && ins.damage_notes.trim().length > 0);
    if (hasDamage) {
      damageIncidents++;
    }

    r.charges.forEach((c) => {
      const amt = Number(c.amount);
      if (c.charge_type === 'Fuel Charge') {
        fuelChargesSum += amt;
      } else if (c.charge_type === 'Mileage Charge') {
        mileageChargesSum += amt;
      } else if (c.charge_type === 'Late Return Charge') {
        lateChargesSum += amt;
      }
    });
  });

  return {
    metrics: {
      total,
      statusCounts,
      damageIncidents,
      fuelChargesSum,
      mileageChargesSum,
      lateChargesSum,
      totalChargesSum: fuelChargesSum + mileageChargesSum + lateChargesSum,
    },
    returns,
  };
};

const getVehicleExpiryReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

  const days = parseInt(queryFilters.days || '30', 10);
  const now = new Date();
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + days);

  const documents = await prisma.vehicleDocument.findMany({
    where: {
      expiry_date: {
        gte: now,
        lte: limitDate,
      },
    },
    include: {
      vehicle: {
        select: { plate_number: true, make: true, model: true },
      },
    },
  });

  const insuranceExpiring = documents.filter(d => d.document_type.toLowerCase().includes('insurance'));
  const registrationExpiring = documents.filter(d => d.document_type.toLowerCase().includes('registration'));
  const inspectionExpiring = documents.filter(d => d.document_type.toLowerCase().includes('inspection'));

  return {
    daysFilter: days,
    metrics: {
      totalExpiring: documents.length,
      insuranceCount: insuranceExpiring.length,
      registrationCount: registrationExpiring.length,
      inspectionCount: inspectionExpiring.length,
    },
    insuranceExpiring,
    registrationExpiring,
    inspectionExpiring,
    allDocuments: documents,
  };
};

const getDriverExpiryReport = async (currentUserRole) => {
  assertReportAccess(currentUserRole);

  const drivers = await prisma.driverProfile.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
    },
  });

  const now = new Date().getTime();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms60 = 60 * 24 * 60 * 60 * 1000;
  const ms90 = 90 * 24 * 60 * 60 * 1000;

  const expiredLicenses = [];
  const expiring30 = [];
  const expiring60 = [];
  const expiring90 = [];

  drivers.forEach((d) => {
    const expiry = new Date(d.license_expiry_date).getTime();
    const diff = expiry - now;

    const driverObj = {
      driverId: d.id,
      name: d.user.name,
      email: d.user.email,
      licenseId: d.driving_license_id,
      expiryDate: d.license_expiry_date,
    };

    if (diff < 0) {
      expiredLicenses.push(driverObj);
    } else if (diff <= ms30) {
      expiring30.push(driverObj);
    } else if (diff <= ms60) {
      expiring60.push(driverObj);
    } else if (diff <= ms90) {
      expiring90.push(driverObj);
    }
  });

  return {
    metrics: {
      expiredCount: expiredLicenses.length,
      expiring30Count: expiring30.length,
      expiring60Count: expiring60.length,
      expiring90Count: expiring90.length,
    },
    expiredLicenses,
    expiring30,
    expiring60,
    expiring90,
  };
};

const getDashboardSummary = async (currentUserRole) => {
  assertReportAccess(currentUserRole);

  const [
    bookings,
    payments,
    vehicles,
    drivers,
    deliveries,
    returns,
    customers,
  ] = await Promise.all([
    prisma.booking.findMany({ where: { is_deleted: false } }),
    prisma.payment.findMany(),
    prisma.vehicle.findMany({ where: { is_deleted: false } }),
    prisma.driverProfile.findMany(),
    prisma.delivery.findMany(),
    prisma.vehicleReturn.findMany(),
    prisma.customer.findMany(),
  ]);

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);

  const monthlyRevenueTrend = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toLocaleString('default', { month: 'short' });
    const year = d.getFullYear();

    const monthPayments = payments.filter(p => {
      const pDate = new Date(p.created_at);
      return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
    });

    const revenue = monthPayments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
    monthlyRevenueTrend.push({
      label: `${month} ${year}`,
      revenue,
    });
  }

  return {
    totalRevenue,
    activeRentals: bookings.filter(b => b.status === 'Active_Rental').length,
    availableVehicles: vehicles.filter(v => v.status === 'Available').length,
    vehiclesInTrip: vehicles.filter(v => v.status === 'In_Trip').length,
    pendingDeliveries: deliveries.filter(d => d.status !== 'Delivered').length,
    pendingReturns: returns.filter(r => r.status !== 'Completed').length,
    totalDrivers: drivers.length,
    availableDrivers: drivers.filter(d => d.availability === 'Available').length,
    totalCustomers: customers.length,
    monthlyRevenueTrend,
  };
};

// Simple CSV Generator Helper
const exportToCsvString = (data, columns) => {
  const headers = columns.map(col => `"${col.header.replace(/"/g, '""')}"`).join(',');
  const rows = data.map(row => {
    return columns.map(col => {
      const cellVal = row[col.key] !== undefined ? String(row[col.key]) : '';
      return `"${cellVal.replace(/"/g, '""')}"`;
    }).join(',');
  });
  return [headers, ...rows].join('\r\n');
};

// Excel Friendly HTML Table Generator
const exportToExcelHtml = (data, columns) => {
  let html = '<html><head><meta charset="utf-8"></head><body><table border="1"><tr>';
  columns.forEach(col => {
    html += `<th style="background-color:#f2f2f2;">${col.header}</th>`;
  });
  html += '</tr>';
  data.forEach(row => {
    html += '<tr>';
    columns.forEach(col => {
      const val = row[col.key] !== undefined ? row[col.key] : '';
      html += `<td>${val}</td>`;
    });
    html += '</tr>';
  });
  html += '</table></body></html>';
  return Buffer.from(html, 'utf-8');
};

module.exports = {
  getBookingsReport,
  getFinancialReport,
  getRevenueReport,
  getVehiclePerformanceReport,
  getVehicleReport,
  getDriverReport,
  getDeliveryReport,
  getReturnReport,
  getVehicleExpiryReport,
  getDriverExpiryReport,
  getDashboardSummary,
  exportToCsvString,
  exportToExcelHtml,
};
