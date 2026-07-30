const express = require('express');
const authController = require('../controllers/auth');
const authValidator = require('../validators/auth');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.post('/login', authValidator.validateLogin, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authValidator.validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', authValidator.validateResetPassword, authController.resetPassword);

// Protected Routes
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.post('/change-password', authenticate, authValidator.validateChangePassword, authController.changePassword);

module.exports = router;
