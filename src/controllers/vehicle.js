const vehicleService = require('../services/vehicle');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.createVehicle(req.body, req.user.id, req.user.role);
    return success(res, 'Vehicle created successfully.', { vehicle }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { vehicles, pagination } = await vehicleService.getVehicles(req.query);
    return success(res, 'Vehicles retrieved successfully.', { vehicles, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    return success(res, 'Vehicle retrieved successfully.', { vehicle });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Vehicle updated successfully.', { vehicle });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const vehicle = await vehicleService.updateVehicleStatus(req.params.id, status, req.user.id);
    return success(res, `Vehicle status updated to ${status} successfully.`, { vehicle });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await vehicleService.softDeleteVehicle(req.params.id, req.user.id, req.user.role);
    return success(res, 'Vehicle soft-deleted successfully.');
  } catch (error) {
    next(error);
  }
};

const addDocument = async (req, res, next) => {
  try {
    const doc = await vehicleService.addDocument(req.params.id, req.body);
    return success(res, 'Document added successfully.', { document: doc }, 201);
  } catch (error) {
    next(error);
  }
};

const addMaintenance = async (req, res, next) => {
  try {
    const maintenance = await vehicleService.addMaintenance(req.params.id, req.body);
    return success(res, 'Maintenance record logged successfully.', { maintenance }, 201);
  } catch (error) {
    next(error);
  }
};

const addMedia = async (req, res, next) => {
  try {
    const media = await vehicleService.addMedia(req.params.id, req.body);
    return success(res, 'Media resource added successfully.', { media }, 201);
  } catch (error) {
    next(error);
  }
};

const getDocuments = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    return success(res, 'Documents retrieved successfully.', { documents: vehicle.documents });
  } catch (error) {
    next(error);
  }
};

const getMaintenance = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    return success(res, 'Maintenance logs retrieved successfully.', { maintenance: vehicle.maintenances });
  } catch (error) {
    next(error);
  }
};

const getMedia = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    return success(res, 'Media files retrieved successfully.', { media: vehicle.media });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  updateStatus,
  remove,
  addDocument,
  addMaintenance,
  addMedia,
  getDocuments,
  getMaintenance,
  getMedia,
};
