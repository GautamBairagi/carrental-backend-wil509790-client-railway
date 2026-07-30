const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { UnauthorizedError, BadRequestError, NotFoundError } = require('../utils/errors');
const { signAccessToken, signRefreshToken } = require('../utils/tokens');
const logger = require('../utils/logger');

// Helper to hash tokens (for refresh tokens and reset tokens)
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const loginUser = async (identifier, password) => {
  // Automatically check if identifier is email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier }
      ],
      is_deleted: false,
    },
  });

  if (!user || user.status === 'Inactive') {
    throw new UnauthorizedError('Invalid login credentials.');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid login credentials.');
  }

  // Generate tokens
  const accessToken = signAccessToken(user);
  const rawRefreshToken = signRefreshToken(user);
  const refreshTokenHash = hashToken(rawRefreshToken);

  // Store refresh token in DB
  const refreshExpiry = new Date();
  refreshExpiry.setDate(refreshExpiry.getDate() + 30); // 30 days

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: refreshTokenHash,
        expires_at: refreshExpiry,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    })
  ]);

  // Remove password hash from user response payload
  const { password_hash, ...userResponse } = user;

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: userResponse,
  };
};

const logoutUser = async (refreshToken) => {
  if (!refreshToken) {
    throw new BadRequestError('Refresh token is required to logout.');
  }

  const tokenHash = hashToken(refreshToken);

  // Revoke refresh token
  await prisma.refreshToken.updateMany({
    where: { token_hash: tokenHash },
    data: { revoked: true },
  });
};

const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is missing.');
  }

  const tokenHash = hashToken(refreshToken);

  // Retrieve token from database
  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      token_hash: tokenHash,
      revoked: false,
      expires_at: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!storedToken || storedToken.user.is_deleted || storedToken.user.status === 'Inactive') {
    throw new UnauthorizedError('Invalid or expired refresh token.');
  }

  // Revoke the old refresh token (rotate)
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revoked: true },
  });

  // Issue new tokens
  const accessToken = signAccessToken(storedToken.user);
  const rawRefreshToken = signRefreshToken(storedToken.user);
  const newRefreshTokenHash = hashToken(rawRefreshToken);

  const refreshExpiry = new Date();
  refreshExpiry.setDate(refreshExpiry.getDate() + 30);

  await prisma.refreshToken.create({
    data: {
      user_id: storedToken.user.id,
      token_hash: newRefreshTokenHash,
      expires_at: refreshExpiry,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
  };
};

const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isPasswordValid) {
    throw new BadRequestError('Incorrect current password.');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { password_hash: newPasswordHash },
  });
};

const forgotUserPassword = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || user.is_deleted) {
    // Return true to prevent email enumeration attacks
    logger.warn(`Password reset requested for non-existent or deleted email: ${email}`);
    return;
  }

  // Generate raw reset token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1); // 1 hour expiry

  await prisma.passwordResetToken.create({
    data: {
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiry,
    },
  });

  // Log raw token (Temporary replacement for actual email delivery)
  logger.info(`--------------------------------------------------------------------------------`);
  logger.info(`PASSWORD RESET REQUEST FOR USER [${user.username}]: ${email}`);
  logger.info(`RAW RESET TOKEN: ${rawToken}`);
  logger.info(`--------------------------------------------------------------------------------`);
};

const resetUserPassword = async (token, newPassword) => {
  const tokenHash = hashToken(token);

  // Validate the reset token
  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token_hash: tokenHash,
      used: false,
      expires_at: { gt: new Date() },
    },
  });

  if (!resetToken) {
    throw new BadRequestError('Invalid or expired reset token.');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.user_id },
      data: { password_hash: newPasswordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    })
  ]);
};

const updateUserProfile = async (userId, data) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.is_deleted) {
    throw new NotFoundError('User not found.');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name !== undefined ? data.name : user.name,
      phone: data.phone !== undefined ? data.phone : user.phone,
      avatar_url: data.avatar_url !== undefined ? data.avatar_url : user.avatar_url,
    },
  });

  const { password_hash, ...userResponse } = updatedUser;
  return userResponse;
};

module.exports = {
  loginUser,
  logoutUser,
  refreshTokens,
  changeUserPassword,
  forgotUserPassword,
  resetUserPassword,
  updateUserProfile,
};
