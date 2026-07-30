const userService = require('../services/user');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.id, req.user.role);
    return success(res, 'User created successfully.', { user }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { users, pagination } = await userService.getUsers(req.query);
    return success(res, 'Users retrieved successfully.', { users, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    return success(res, 'User retrieved successfully.', { user });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'User updated successfully.', { user });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const user = await userService.updateUserStatus(req.params.id, status, req.user.id, req.user.role);
    return success(res, `User status updated to ${status} successfully.`, { user });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await userService.softDeleteUser(req.params.id, req.user.id, req.user.role);
    return success(res, 'User soft-deleted successfully.');
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
};
