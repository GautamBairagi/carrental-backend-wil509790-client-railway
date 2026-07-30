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

const getRevenueReport = async (queryFilters, currentUserRole) => {
  assertReportAccess(currentUserRole);

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

  let totalRevenue = 0;
  let outstandingBalance = 0;
  let refundTotals = 0;

  payments.forEach((p) => {
    totalRevenue += Number(p.paid_amount);
    outstandingBalance += Number(p.remaining_amount);
    if (p.status === 'Refunded') {
      refundTotals += Number(p.amount); // fully refunded amount
    }
  });

  // Daily revenue trend (last 30 days)
  const last30Days = [...Array(30).keys()].map(i => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const dailyTrend = last30Days.map(date => {
    const dayPayments = payments.filter(p => {
      const pDate = new Date(p.created_at);
      pDate.setHours(0, 0, 0, 0);
      return pDate.getTime() === date.getTime();
    });
    const revenue = dayPayments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
    return {
      date: date.toISOString().split('T')[0],
      revenue,
    };
  }).reverse();

  return {
    metrics: {
      totalRevenue,
      outstandingBalance,
      refundTotals,
    },
    dailyTrend,
    payments,
  };
};

const getVehicleReport = async (currentUserRole) => {
  assertReportAccess(currentUserRole);

  const vehicles = await prisma.vehicle.findMany({
    where: { is_deleted: false },
    include: {
      bookings: {
        where: { is_deleted: false },
      },
    },
  });

  const totalCount = vehicles.length;
  const statusCounts = {
    Available: vehicles.filter(v => v.status === 'Available').length,
    Reserved: vehicles.filter(v => v.status === 'Reserved').length,
    In_Trip: vehicles.filter(v => v.status === 'In_Trip').length,
    Maintenance: vehicles.filter(v => v.status === 'Maintenance').length,
  };

  const utilizationRate = totalCount > 0 ? ((statusCounts.In_Trip / totalCount) * 100) : 0;

  // Sorting vehicles by booking frequency
  const sortedVehicles = [...vehicles].sort((a, b) => b.bookings.length - a.bookings.length);
  const mostBooked = sortedVehicles.slice(0, 5).map(v => ({
    id: v.id,
    plate_number: v.plate_number,
    make: v.make,
    model: v.model,
    bookingCount: v.bookings.length,
  }));

  const leastUsed = [...vehicles].sort((a, b) => a.bookings.length - b.bookings.length).slice(0, 5).map(v => ({
    id: v.id,
    plate_number: v.plate_number,
    make: v.make,
    model: v.model,
    bookingCount: v.bookings.length,
  }));

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

  // Performance calculations from DB metadata fields
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

  // Delayed deliveries: scheduled_date < actual_delivery_time
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
    // Damage incidents
    const hasDamage = r.inspections.some(ins => ins.damage_notes && ins.damage_notes.trim().length > 0);
    if (hasDamage) {
      damageIncidents++;
    }

    // Sum charges
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

  // Retrieve vehicle documents expiring soon
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

  // Group by document type
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

  // Total Revenue (paid amount)
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);

  // Monthly revenue trend (last 6 months)
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
  getRevenueReport,
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
