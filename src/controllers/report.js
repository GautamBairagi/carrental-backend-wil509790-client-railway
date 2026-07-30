const reportService = require('../services/report');
const { success } = require('../utils/response');

const exportHelper = (res, data, columns, format) => {
  if (format === 'csv') {
    const csv = reportService.exportToCsvString(data, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=report-${Date.now()}.csv`);
    return res.send(csv);
  } else if (format === 'xlsx') {
    const excel = reportService.exportToExcelHtml(data, columns);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename=report-${Date.now()}.xls`);
    return res.send(excel);
  }
};

const getBookings = async (req, res, next) => {
  try {
    const { totals, bookings } = await reportService.getBookingsReport(req.query, req.user.role);
    
    if (req.query.export) {
      const exportData = bookings.map(b => ({
        booking_number: b.booking_number,
        customerName: b.customer.full_name,
        customerEmail: b.customer.email,
        vehicleDetails: `${b.vehicle.make} ${b.vehicle.model} (${b.vehicle.plate_number})`,
        pickup_date: b.pickup_date.toISOString().split('T')[0],
        return_date: b.return_date.toISOString().split('T')[0],
        rental_days: b.rental_days,
        total_amount: b.total_amount,
        status: b.status,
      }));
      const columns = [
        { header: 'Booking Number', key: 'booking_number' },
        { header: 'Customer Name', key: 'customerName' },
        { header: 'Customer Email', key: 'customerEmail' },
        { header: 'Vehicle', key: 'vehicleDetails' },
        { header: 'Pickup Date', key: 'pickup_date' },
        { header: 'Return Date', key: 'return_date' },
        { header: 'Rental Days', key: 'rental_days' },
        { header: 'Total Amount ($)', key: 'total_amount' },
        { header: 'Status', key: 'status' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Bookings report generated successfully.', { totals, bookings });
  } catch (error) {
    next(error);
  }
};

const getRevenue = async (req, res, next) => {
  try {
    const { metrics, dailyTrend, payments } = await reportService.getRevenueReport(req.query, req.user.role);

    if (req.query.export) {
      const exportData = payments.map(p => ({
        payment_number: p.payment_number,
        booking_number: p.booking.booking_number,
        customer: p.customer.full_name,
        payment_method: p.payment_method,
        amount: p.amount,
        paid_amount: p.paid_amount,
        remaining_amount: p.remaining_amount,
        status: p.status,
        created_at: p.created_at.toISOString().split('T')[0],
      }));
      const columns = [
        { header: 'Payment Number', key: 'payment_number' },
        { header: 'Booking Number', key: 'booking_number' },
        { header: 'Customer', key: 'customer' },
        { header: 'Method', key: 'payment_method' },
        { header: 'Amount ($)', key: 'amount' },
        { header: 'Paid Amount ($)', key: 'paid_amount' },
        { header: 'Remaining ($)', key: 'remaining_amount' },
        { header: 'Status', key: 'status' },
        { header: 'Date', key: 'created_at' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Revenue report generated successfully.', { metrics, dailyTrend, payments });
  } catch (error) {
    next(error);
  }
};

const getVehicles = async (req, res, next) => {
  try {
    const { metrics, mostBooked, leastUsed, vehicles } = await reportService.getVehicleReport(req.user.role);

    if (req.query.export) {
      const exportData = vehicles.map(v => ({
        plate_number: v.plate_number,
        make: v.make,
        model: v.model,
        category: v.category,
        status: v.status,
        rate: v.daily_rental_rate,
      }));
      const columns = [
        { header: 'Plate Number', key: 'plate_number' },
        { header: 'Make', key: 'make' },
        { header: 'Model', key: 'model' },
        { header: 'Category', key: 'category' },
        { header: 'Status', key: 'status' },
        { header: 'Daily Rate ($)', key: 'rate' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Vehicle report generated successfully.', { metrics, mostBooked, leastUsed, vehicles });
  } catch (error) {
    next(error);
  }
};

const getDrivers = async (req, res, next) => {
  try {
    const { metrics, driverPerformance } = await reportService.getDriverReport(req.user.role);

    if (req.query.export) {
      const columns = [
        { header: 'Driver ID', key: 'driverId' },
        { header: 'Name', key: 'name' },
        { header: 'Total Assignments', key: 'totalAssignments' },
        { header: 'Completed Assignments', key: 'completedAssignments' },
        { header: 'Cancellation %', key: 'cancellationPercent' },
        { header: 'Average Rating', key: 'averageRating' },
        { header: 'On-Time %', key: 'onTimePercent' },
      ];
      return exportHelper(res, driverPerformance, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Driver report generated successfully.', { metrics, driverPerformance });
  } catch (error) {
    next(error);
  }
};

const getDeliveries = async (req, res, next) => {
  try {
    const { metrics, deliveries } = await reportService.getDeliveryReport(req.query, req.user.role);

    if (req.query.export) {
      const exportData = deliveries.map(d => ({
        delivery_number: d.delivery_number,
        pickup_address: d.pickup_address,
        delivery_address: d.delivery_address,
        status: d.status,
        scheduled_date: d.scheduled_date.toISOString().split('T')[0],
        actual_delivery_time: d.actual_delivery_time ? d.actual_delivery_time.toISOString() : '',
      }));
      const columns = [
        { header: 'Delivery Number', key: 'delivery_number' },
        { header: 'Pickup Address', key: 'pickup_address' },
        { header: 'Delivery Address', key: 'delivery_address' },
        { header: 'Status', key: 'status' },
        { header: 'Scheduled Date', key: 'scheduled_date' },
        { header: 'Actual Time', key: 'actual_delivery_time' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Delivery report generated successfully.', { metrics, deliveries });
  } catch (error) {
    next(error);
  }
};

const getReturns = async (req, res, next) => {
  try {
    const { metrics, returns } = await reportService.getReturnReport(req.query, req.user.role);

    if (req.query.export) {
      const exportData = returns.map(r => ({
        return_number: r.return_number,
        status: r.status,
        scheduled_return_date: r.scheduled_return_date.toISOString().split('T')[0],
        actual_return_date: r.actual_return_date ? r.actual_return_date.toISOString() : '',
      }));
      const columns = [
        { header: 'Return Number', key: 'return_number' },
        { header: 'Status', key: 'status' },
        { header: 'Scheduled Date', key: 'scheduled_return_date' },
        { header: 'Actual Time', key: 'actual_return_date' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    if (req.query.export === 'pdf') {
      return success(res, 'PDF generation is a placeholder. File export is pending.', {
        placeholder: true,
        pdfBase64: 'placeholder_base64_data',
      });
    }

    return success(res, 'Return report generated successfully.', { metrics, returns });
  } catch (error) {
    next(error);
  }
};

const getVehicleExpiry = async (req, res, next) => {
  try {
    const { daysFilter, metrics, insuranceExpiring, registrationExpiring, inspectionExpiring, allDocuments } = await reportService.getVehicleExpiryReport(req.query, req.user.role);

    if (req.query.export) {
      const exportData = allDocuments.map(d => ({
        plate_number: d.vehicle.plate_number,
        vehicle: `${d.vehicle.make} ${d.vehicle.model}`,
        document_type: d.document_type,
        document_number: d.document_number,
        expiry_date: d.expiry_date.toISOString().split('T')[0],
      }));
      const columns = [
        { header: 'Plate Number', key: 'plate_number' },
        { header: 'Vehicle', key: 'vehicle' },
        { header: 'Doc Type', key: 'document_type' },
        { header: 'Doc Number', key: 'document_number' },
        { header: 'Expiry Date', key: 'expiry_date' },
      ];
      return exportHelper(res, exportData, columns, req.query.export);
    }

    return success(res, 'Vehicle document expiry report generated successfully.', {
      daysFilter,
      metrics,
      insuranceExpiring,
      registrationExpiring,
      inspectionExpiring,
    });
  } catch (error) {
    next(error);
  }
};

const getDriverExpiry = async (req, res, next) => {
  try {
    const { metrics, expiredLicenses, expiring30, expiring60, expiring90 } = await reportService.getDriverExpiryReport(req.user.role);

    if (req.query.export) {
      const allList = [...expiredLicenses, ...expiring30, ...expiring60, ...expiring90];
      const columns = [
        { header: 'Driver ID', key: 'driverId' },
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'License Number', key: 'licenseId' },
        { header: 'Expiry Date', key: 'expiryDate' },
      ];
      return exportHelper(res, allList, columns, req.query.export);
    }

    return success(res, 'Driver license expiry report generated successfully.', {
      metrics,
      expiredLicenses,
      expiring30,
      expiring60,
      expiring90,
    });
  } catch (error) {
    next(error);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await reportService.getDashboardSummary(req.user.role);
    return success(res, 'Dashboard summary metrics retrieved successfully.', { dashboard });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBookings,
  getRevenue,
  getVehicles,
  getDrivers,
  getDeliveries,
  getReturns,
  getVehicleExpiry,
  getDriverExpiry,
  getDashboard,
};
