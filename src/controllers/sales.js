const salesService = require('../services/sales');
const { success } = require('../utils/response');

// ── PUBLIC ─────────────────────────────────────────────────

const getSaleCars = async (req, res, next) => {
  try {
    const data = await salesService.getSaleCars(req.query);
    return success(res, 'Sale vehicles retrieved successfully.', data);
  } catch (error) {
    next(error);
  }
};

const getSaleCarById = async (req, res, next) => {
  try {
    const vehicle = await salesService.getSaleCarById(req.params.id);
    return success(res, 'Sale vehicle retrieved successfully.', { vehicle });
  } catch (error) {
    next(error);
  }
};

const createInquiry = async (req, res, next) => {
  try {
    const inquiry = await salesService.createInquiry(req.params.vehicleId, req.body);
    return success(res, 'Inquiry submitted successfully! Our team will contact you shortly.', { inquiry }, 201);
  } catch (error) {
    next(error);
  }
};

// ── ADMIN ──────────────────────────────────────────────────

const getSaleStats = async (req, res, next) => {
  try {
    const stats = await salesService.getSaleStats();
    return success(res, 'Sale statistics retrieved.', { stats });
  } catch (error) {
    next(error);
  }
};

const listInquiries = async (req, res, next) => {
  try {
    const data = await salesService.listInquiries(req.query);
    return success(res, 'Inquiries retrieved successfully.', data);
  } catch (error) {
    next(error);
  }
};

const getInquiryById = async (req, res, next) => {
  try {
    const inquiry = await salesService.getInquiryById(req.params.id);
    return success(res, 'Inquiry retrieved successfully.', { inquiry });
  } catch (error) {
    next(error);
  }
};

const updateInquiry = async (req, res, next) => {
  try {
    const inquiry = await salesService.updateInquiry(req.params.id, req.body);
    return success(res, 'Inquiry updated successfully.', { inquiry });
  } catch (error) {
    next(error);
  }
};

const listVehicleForSale = async (req, res, next) => {
  try {
    const vehicle = await salesService.listVehicleForSale(req.params.vehicleId, req.body);
    return success(res, 'Vehicle listed for sale successfully.', { vehicle });
  } catch (error) {
    next(error);
  }
};

const delistVehicleFromSale = async (req, res, next) => {
  try {
    const vehicle = await salesService.delistVehicleFromSale(req.params.vehicleId);
    return success(res, 'Vehicle removed from sale listing.', { vehicle });
  } catch (error) {
    next(error);
  }
};

const markVehicleAsSold = async (req, res, next) => {
  try {
    const { inquiryId } = req.body;
    const vehicle = await salesService.markVehicleAsSold(req.params.vehicleId, inquiryId);
    return success(res, 'Vehicle marked as SOLD successfully. Fleet updated.', { vehicle });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSaleCars,
  getSaleCarById,
  createInquiry,
  getSaleStats,
  listInquiries,
  getInquiryById,
  updateInquiry,
  listVehicleForSale,
  delistVehicleFromSale,
  markVehicleAsSold,
};
