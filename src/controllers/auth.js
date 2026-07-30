const authService = require('../services/auth');
const { success } = require('../utils/response');

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const result = await authService.loginUser(identifier, password);
    return success(res, 'Login successful.', result);
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logoutUser(refreshToken);
    return success(res, 'Logout successful.');
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    return success(res, 'Tokens refreshed successfully.', result);
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changeUserPassword(req.user.id, currentPassword, newPassword);
    return success(res, 'Password changed successfully.');
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.forgotUserPassword(email);
    return success(res, 'If the email exists, a password reset token has been generated.');
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetUserPassword(token, newPassword);
    return success(res, 'Password reset successful.');
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const { password_hash, ...userResponse } = req.user;
    return success(res, 'Profile retrieved successfully.', { user: userResponse });
  } catch (error) {
    next(error);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const { name, phone, avatar_url } = req.body;
    const updatedUser = await authService.updateUserProfile(req.user.id, { name, phone, avatar_url });
    return success(res, 'Profile updated successfully.', { user: updatedUser });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  refreshToken,
  changePassword,
  forgotPassword,
  resetPassword,
  me,
  updateMe,
};
