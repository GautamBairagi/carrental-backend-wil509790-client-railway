const driverService = require('../services/driver');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const { drivers, pagination } = await driverService.getDrivers(req.query);
    return success(res, 'Drivers retrieved successfully.', { drivers, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const driver = await driverService.getDriverById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Driver profile retrieved successfully.', { driver });
  } catch (error) {
    next(error);
  }
};

const updateAvailability = async (req, res, next) => {
  try {
    const { availability } = req.body;
    const driver = await driverService.updateDriverAvailability(req.params.id, availability, req.user.id, req.user.role);
    return success(res, `Driver availability updated to ${availability} successfully.`, { driver });
  } catch (error) {
    next(error);
  }
};

const getCompliance = async (req, res, next) => {
  try {
    const compliance = await driverService.getComplianceReport(req.params.id, req.user.id, req.user.role);
    return success(res, 'Driver compliance report retrieved successfully.', { compliance });
  } catch (error) {
    next(error);
  }
};

const getPerformance = async (req, res, next) => {
  try {
    const performance = await driverService.getPerformanceMetrics(req.params.id, req.user.id, req.user.role);
    return success(res, 'Driver performance metrics retrieved successfully.', { performance });
  } catch (error) {
    next(error);
  }
};

const getDocuments = async (req, res, next) => {
  try {
    const documents = await driverService.getDriverDocuments(req.params.id, req.user.id, req.user.role);
    return success(res, 'Driver documents retrieved successfully.', { documents });
  } catch (error) {
    next(error);
  }
};

const addDocument = async (req, res, next) => {
  try {
    const document = await driverService.addDriverDocument(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Document uploaded and added successfully.', { document }, 201);
  } catch (error) {
    next(error);
  }
};

const getMyProfile = async (req, res, next) => {
  try {
    const driver = await driverService.getMyDriverProfile(req.user.id);
    return success(res, 'My Driver profile retrieved successfully.', { driver });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  updateAvailability,
  getCompliance,
  getPerformance,
  getDocuments,
  addDocument,
  getMyProfile,
};
