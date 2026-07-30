const returnService = require('../services/return');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const returnRecord = await returnService.createReturn(req.body, req.user.id, req.user.role);
    return success(res, 'Vehicle return scheduled successfully.', { returnRecord }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { returns, pagination } = await returnService.getReturns(req.query, req.user.id, req.user.role);
    return success(res, 'Returns retrieved successfully.', { returns, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const returnRecord = await returnService.getReturnById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Return retrieved successfully.', { returnRecord });
  } catch (error) {
    next(error);
  }
};

const addInspection = async (req, res, next) => {
  try {
    const inspection = await returnService.addInspection(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Return inspection recorded and charges calculated.', { inspection }, 201);
  } catch (error) {
    next(error);
  }
};

const addPhoto = async (req, res, next) => {
  try {
    const photo = await returnService.addPhoto(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Return photo uploaded successfully.', { photo }, 201);
  } catch (error) {
    next(error);
  }
};

const captureSignatures = async (req, res, next) => {
  try {
    const returnRecord = await returnService.captureSignatures(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Return signatures captured successfully.', { returnRecord });
  } catch (error) {
    next(error);
  }
};

const approveDamageCharge = async (req, res, next) => {
  try {
    const charge = await returnService.approveDamageCharge(req.params.id, req.params.chargeId, req.body, req.user.id, req.user.role);
    return success(res, 'Damage charge status updated successfully.', { charge });
  } catch (error) {
    next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await returnService.getReturnSummary(req.params.id, req.user.id, req.user.role);
    return success(res, 'Return invoice summary retrieved successfully.', { summary });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const returnRecord = await returnService.updateReturnStatus(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Return status updated successfully.', { returnRecord });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  addInspection,
  addPhoto,
  captureSignatures,
  approveDamageCharge,
  getSummary,
  updateStatus,
};
