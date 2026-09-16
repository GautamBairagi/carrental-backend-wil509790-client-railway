const path = require('path');
const express = require('express');
const cors = require('cors');
const morganMiddleware = require('./middlewares/logger');
const errorHandler = require('./middlewares/error');
const { success } = require('./utils/response');
const { NotFoundError } = require('./utils/errors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Global Middlewares
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://novadrive-carrentals.netlify.app',
  'https://novadriverentals.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(helmet({
  contentSecurityPolicy: true,
  xssFilter: true,
  noSniff: true,
  frameguard: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morganMiddleware);

// Serve Static Uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const vehicleRouter = require('./routes/vehicle');
const driverRouter = require('./routes/driver');
const bookingRouter = require('./routes/booking');
const contractRouter = require('./routes/contract');
const paymentRouter = require('./routes/payment');
const stripePaymentRouter = require('./routes/stripePayment');
const deliveryRouter = require('./routes/delivery');
const returnRouter = require('./routes/return');
const reportRouter = require('./routes/report');
const settingRouter = require('./routes/setting');
const notificationRouter = require('./routes/notification');
const dashboardRouter = require('./routes/dashboard');
const customerRouter = require('./routes/customer');
const uploadRouter = require('./routes/upload');
const imagekitRouter = require('./routes/imagekit');
const salesRouter = require('./routes/sales');
const expenseRouter = require('./routes/expense');
const recurringPaymentRouter = require('./routes/recurringPayment');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'error', message: 'Too many requests from this IP, please try again after 15 minutes.' },
});

app.use('/auth/login', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);
app.use('/auth/refresh-token', authLimiter);

app.use('/auth', authRouter);
app.use('/users', userRouter);
app.use('/vehicles', vehicleRouter);
app.use('/drivers', driverRouter);
app.use('/bookings', bookingRouter);
app.use('/contracts', contractRouter);
app.use('/payments', stripePaymentRouter);
app.use('/payments', paymentRouter);

app.use('/deliveries', deliveryRouter);
app.use('/returns', returnRouter);
app.use('/reports', reportRouter);
app.use('/settings', settingRouter);
app.use('/notifications', notificationRouter);
app.use('/dashboard', dashboardRouter);
app.use('/customers', customerRouter);
app.use('/upload', uploadRouter);
app.use('/imagekit', imagekitRouter);
app.use('/sales', salesRouter);
app.use('/expenses', expenseRouter);
app.use('/recurring-payments', recurringPaymentRouter);

// Health Check Endpoint
app.get('/health', (req, res) => {
  return success(res, 'Health check passed. Server is running.', {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Catch 404 for unhandled routes
app.use((req, res, next) => {
  next(new NotFoundError(`Cannot find ${req.originalUrl} on this server.`));
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
