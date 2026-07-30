const prisma = require('../config/db');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

const getAdminDashboard = async (currentUserRole) => {
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Administrators can access the Admin Dashboard.');
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    payments,
    vehicles,
    drivers,
    bookings,
    deliveries,
    returns,
    customers,
    saleInquiries,
  ] = await Promise.all([
    prisma.payment.findMany(),
    prisma.vehicle.findMany({ where: { is_deleted: false } }),
    prisma.driverProfile.findMany({ include: { user: true } }),
    prisma.booking.findMany({ where: { is_deleted: false } }),
    prisma.delivery.findMany(),
    prisma.vehicleReturn.findMany({ include: { inspections: true } }),
    prisma.customer.findMany(),
    prisma.vehicleSaleInquiry.findMany({ where: { is_deleted: false } }),
  ]);

  // Financial aggregates
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
  const monthlyRevenue = payments
    .filter(p => new Date(p.created_at) >= startOfMonth)
    .reduce((sum, p) => sum + Number(p.paid_amount), 0);
  const outstandingBalance = payments.reduce((sum, p) => sum + Number(p.remaining_amount), 0);

  // Vehicle stats
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter(v => v.status === 'Available').length;
  const vehiclesInTrip = vehicles.filter(v => v.status === 'In_Trip').length;
  const vehiclesInMaintenance = vehicles.filter(v => v.status === 'Maintenance').length;

  // Driver stats
  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter(d => d.availability === 'Available').length;
  const busyDrivers = drivers.filter(d => d.availability === 'Busy').length;

  // Booking & Delivery stats
  const totalBookings = bookings.length;
  const activeRentals = bookings.filter(b => b.status === 'Active_Rental').length;
  const completedRentals = bookings.filter(b => b.status === 'Completed').length;
  const pendingDeliveries = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled').length;
  const pendingReturns = returns.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length;
  const totalCustomers = customers.length;

  // Sales stats
  const salesListedCount = vehicles.filter(v => v.is_for_sale && v.status !== 'Sold').length;
  const salesSoldCount = vehicles.filter(v => v.status === 'Sold').length;
  const salesRevenue = vehicles.filter(v => v.status === 'Sold').reduce((sum, v) => sum + Number(v.sale_price || 0), 0);
  const salesInquiriesCount = saleInquiries.length;
  const newSalesInquiriesCount = saleInquiries.filter(si => si.status === 'New').length;

  // Trends & Widgets
  const monthlyRevenueTrend = [];
  const monthlyBookingsTrend = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear();

    // Revenue
    const mPay = payments.filter(p => {
      const pDate = new Date(p.created_at);
      return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
    });

    // Sales Revenue in the month
    const mSales = vehicles.filter(v => {
      if (v.status !== 'Sold') return false;
      const vDate = new Date(v.updated_at);
      return vDate.getMonth() === d.getMonth() && vDate.getFullYear() === d.getFullYear();
    });
    const monthlySalesRevenue = mSales.reduce((sum, v) => sum + Number(v.sale_price || 0), 0);

    monthlyRevenueTrend.push({
      label: monthLabel,
      revenue: mPay.reduce((sum, p) => sum + Number(p.paid_amount), 0),
      salesRevenue: monthlySalesRevenue,
    });

    // Bookings
    const mBook = bookings.filter(b => {
      const bDate = new Date(b.created_at);
      return bDate.getMonth() === d.getMonth() && bDate.getFullYear() === d.getFullYear();
    });
    monthlyBookingsTrend.push({
      label: monthLabel,
      bookings: mBook.length,
    });
  }

  const vehicleUtilizationTrend = totalVehicles > 0 ? Number(((vehiclesInTrip / totalVehicles) * 100).toFixed(2)) : 0;

  const driverPerformanceTrend = drivers.map(d => ({
    name: d.user.name,
    rating: Number(d.average_rating),
    onTimePercentage: Number(d.on_time_percentage),
  }));

  const completedDelCount = deliveries.filter(d => d.status === 'Delivered').length;
  const deliverySuccessRate = deliveries.length > 0 ? Number(((completedDelCount / deliveries.length) * 100).toFixed(2)) : 0;

  const returnDamageIncidents = returns.filter(r =>
    r.inspections.some(ins => ins.damage_notes && ins.damage_notes.trim().length > 0)
  ).length;

  return {
    totalRevenue,
    monthlyRevenue,
    outstandingBalance,
    totalVehicles,
    availableVehicles,
    vehiclesInTrip,
    vehiclesInMaintenance,
    totalDrivers,
    availableDrivers,
    busyDrivers,
    totalBookings,
    activeRentals,
    completedRentals,
    pendingDeliveries,
    pendingReturns,
    totalCustomers,
    salesListedCount,
    salesSoldCount,
    salesRevenue,
    salesInquiriesCount,
    newSalesInquiriesCount,
    widgets: {
      revenueTrend: monthlyRevenueTrend,
      monthlyBookingsTrend,
      vehicleUtilizationTrend,
      driverPerformanceTrend,
      deliverySuccessRate,
      returnDamageIncidents,
    },
  };
};

const getOperationsDashboard = async (currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('You do not have permission to view operations metrics.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    deliveries,
    returns,
    drivers,
    vehicles,
    bookings,
    contracts,
    payments,
  ] = await Promise.all([
    prisma.delivery.findMany(),
    prisma.vehicleReturn.findMany(),
    prisma.driverProfile.findMany(),
    prisma.vehicle.findMany({ where: { is_deleted: false } }),
    prisma.booking.findMany({ where: { is_deleted: false } }),
    prisma.contract.findMany(),
    prisma.payment.findMany(),
  ]);

  const todaysDeliveries = deliveries.filter(d => {
    const dDate = new Date(d.scheduled_date);
    return dDate >= today && dDate < tomorrow;
  }).length;

  const pendingDeliveries = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled').length;
  const pendingReturns = returns.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length;

  const driverAvailability = {
    Available: drivers.filter(d => d.availability === 'Available').length,
    Busy: drivers.filter(d => d.availability === 'Busy').length,
    Offline: drivers.filter(d => d.availability === 'Offline').length,
  };

  const vehiclesReady = vehicles.filter(v => v.status === 'Available').length;
  const vehiclesInMaintenance = vehicles.filter(v => v.status === 'Maintenance').length;

  const bookingsAwaitingReview = bookings.filter(b => b.status === 'Pending_Review' || b.status === 'License_Verification_Pending').length;
  const contractsAwaitingSignature = contracts.filter(c => c.status === 'Sent' || c.status === 'Viewed').length;
  const paymentsPending = payments.filter(p => p.status === 'Pending').length;

  return {
    todaysDeliveries,
    pendingDeliveries,
    pendingReturns,
    driverAvailability,
    vehiclesReady,
    vehiclesInMaintenance,
    bookingsAwaitingReview,
    contractsAwaitingSignature,
    paymentsPending,
  };
};

const getDriverDashboard = async (currentUserId, currentUserRole) => {
  if (currentUserRole !== 'DRIVER' && currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only drivers can access the Driver Dashboard.');
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { user_id: currentUserId },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile not found.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [deliveries, returns] = await Promise.all([
    prisma.delivery.findMany({
      where: { driver_id: driverProfile.id },
      include: { checklist_items: true },
    }),
    prisma.vehicleReturn.findMany({
      where: { driver_id: driverProfile.id },
    }),
  ]);

  const assignedDeliveries = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled').length;
  const todaysDeliveries = deliveries.filter(d => {
    const dDate = new Date(d.scheduled_date);
    return dDate >= today && dDate < tomorrow;
  }).length;

  const assignedReturns = returns.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length;
  const completedDeliveries = deliveries.filter(d => d.status === 'Delivered').length;
  const completedReturns = returns.filter(r => r.status === 'Completed').length;

  // Count uncompleted checklist items on active deliveries
  let pendingTasks = 0;
  deliveries.forEach(d => {
    if (d.status !== 'Delivered' && d.status !== 'Cancelled') {
      const pendingItems = d.checklist_items.filter(item => !item.completed).length;
      pendingTasks += pendingItems;
    }
  });

  return {
    assignedDeliveries,
    todaysDeliveries,
    assignedReturns,
    completedDeliveries,
    completedReturns,
    averageRating: Number(driverProfile.average_rating),
    onTimePercentage: Number(driverProfile.on_time_percentage),
    pendingTasks,
  };
};

const getRecentActivity = async (currentUserRole) => {
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'OPERATIONS_MANAGER') {
    throw new ForbiddenError('Only Admins and Operations Managers can view Recent Activity feed.');
  }

  const [bookings, payments, deliveries, returns, contracts] = await Promise.all([
    prisma.booking.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        booking_number: true,
        status: true,
        created_at: true,
        customer: { select: { full_name: true } },
      },
    }),
    prisma.payment.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        payment_number: true,
        amount: true,
        status: true,
        created_at: true,
        customer: { select: { full_name: true } },
      },
    }),
    prisma.delivery.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        delivery_number: true,
        status: true,
        created_at: true,
        customer: { select: { full_name: true } },
      },
    }),
    prisma.vehicleReturn.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        return_number: true,
        status: true,
        created_at: true,
        customer: { select: { full_name: true } },
      },
    }),
    prisma.contract.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        contract_number: true,
        status: true,
        created_at: true,
        customer: { select: { full_name: true } },
      },
    }),
  ]);

  return {
    bookings,
    payments,
    deliveries,
    returns,
    contracts,
  };
};

module.exports = {
  getAdminDashboard,
  getOperationsDashboard,
  getDriverDashboard,
  getRecentActivity,
};
