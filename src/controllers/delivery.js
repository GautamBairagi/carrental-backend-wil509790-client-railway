const deliveryService = require('../services/delivery');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const delivery = await deliveryService.createDelivery(req.body, req.user.id, req.user.role);
    return success(res, 'Delivery scheduled successfully.', { delivery }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { deliveries, pagination } = await deliveryService.getDeliveries(req.query, req.user.id, req.user.role);
    return success(res, 'Deliveries retrieved successfully.', { deliveries, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const delivery = await deliveryService.getDeliveryById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Delivery retrieved successfully.', { delivery });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const delivery = await deliveryService.updateDeliveryStatus(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Delivery status updated successfully.', { delivery });
  } catch (error) {
    next(error);
  }
};

const addInspection = async (req, res, next) => {
  try {
    const inspection = await deliveryService.addInspection(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Delivery inspection recorded successfully.', { inspection }, 201);
  } catch (error) {
    next(error);
  }
};

const addPhoto = async (req, res, next) => {
  try {
    const photo = await deliveryService.addPhoto(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Delivery photo uploaded successfully.', { photo }, 201);
  } catch (error) {
    next(error);
  }
};

const captureSignatures = async (req, res, next) => {
  try {
    const delivery = await deliveryService.captureSignatures(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Handover signatures captured successfully.', { delivery });
  } catch (error) {
    next(error);
  }
};

const updateChecklistItem = async (req, res, next) => {
  try {
    const checklistItem = await deliveryService.updateChecklistItem(req.params.id, req.params.itemId, req.body, req.user.id, req.user.role);
    return success(res, 'Checklist item updated successfully.', { checklistItem });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  updateStatus,
  addInspection,
  addPhoto,
  captureSignatures,
  updateChecklistItem,
};
