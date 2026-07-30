const contractService = require('../services/contract');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const contract = await contractService.createContract(req.body, req.user.id);
    return success(res, 'Contract draft created successfully.', { contract }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { contracts, pagination } = await contractService.getContracts(req.query, req.user.id, req.user.role);
    return success(res, 'Contracts retrieved successfully.', { contracts, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const contract = await contractService.getContractById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Contract retrieved successfully.', { contract });
  } catch (error) {
    next(error);
  }
};

const getByBookingId = async (req, res, next) => {
  try {
    const contract = await contractService.getContractByBookingId(req.params.bookingId, req.user.id, req.user.role);
    return success(res, 'Booking contract retrieved successfully.', { contract });
  } catch (error) {
    next(error);
  }
};

const send = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const contract = await contractService.sendContract(req.params.id, notes, req.user.id);
    return success(res, 'Contract sent successfully.', { contract });
  } catch (error) {
    next(error);
  }
};

const view = async (req, res, next) => {
  try {
    // Public/customer viewed callback
    const contract = await contractService.viewContract(req.params.id, req.user.id);
    return success(res, 'Contract viewed status updated.', { contract });
  } catch (error) {
    next(error);
  }
};

const sign = async (req, res, next) => {
  try {
    const contract = await contractService.signContract(req.params.id, req.body, req.user.id);
    return success(res, 'Contract executed and signed successfully.', { contract });
  } catch (error) {
    next(error);
  }
};

const reject = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const contract = await contractService.rejectContract(req.params.id, notes, req.user.id);
    return success(res, 'Contract rejected successfully.', { contract });
  } catch (error) {
    next(error);
  }
};

const expire = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const contract = await contractService.expireContract(req.params.id, notes, req.user.id);
    return success(res, 'Contract status marked as Expired.', { contract });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  getByBookingId,
  send,
  view,
  sign,
  reject,
  expire,
};
