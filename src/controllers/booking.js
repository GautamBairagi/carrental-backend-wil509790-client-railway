const bookingService = require('../services/booking');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.body, req.user.id);
    return success(res, 'Booking created successfully.', { booking }, 201);
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { bookings, pagination } = await bookingService.getBookings(req.query, req.user.id, req.user.role);
    return success(res, 'Bookings retrieved successfully.', { bookings, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user.id, req.user.role);
    return success(res, 'Booking retrieved successfully.', { booking });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const booking = await bookingService.updateBooking(req.params.id, req.body, req.user.id, req.user.role);
    return success(res, 'Booking updated successfully.', { booking });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const booking = await bookingService.updateBookingStatus(req.params.id, status, notes, req.user.id, req.user.role);
    return success(res, `Booking status updated to ${status} successfully.`, { booking });
  } catch (error) {
    next(error);
  }
};

const assignDriver = async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const booking = await bookingService.assignDriver(req.params.id, driverId, req.user.id, req.user.role);
    return success(res, 'Driver assigned to booking successfully.', { booking });
  } catch (error) {
    next(error);
  }
};

const addNote = async (req, res, next) => {
  try {
    const { note } = req.body;
    const noteRecord = await bookingService.addBookingNote(req.params.id, note, req.user.id, req.user.role);
    return success(res, 'Note added to booking successfully.', { note: noteRecord }, 201);
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await bookingService.softDeleteBooking(req.params.id, req.user.id, req.user.role);
    return success(res, 'Booking soft-deleted successfully.');
  } catch (error) {
    next(error);
  }
};

const createPublicBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.createPublicBooking(req.body);
    return success(res, 'Booking created successfully.', { booking }, 201);
  } catch (error) {
    next(error);
  }
};

const cancelPublicBooking = async (req, res, next) => {
  try {
    await bookingService.cancelPublicBooking(req.params.id);
    return success(res, 'Booking cancelled and vehicle released successfully.');
  } catch (error) {
    next(error);
  }
};

const checkPublicAvailability = async (req, res, next) => {
  try {
    const { vehicleId, pickupDate, returnDate } = req.body;
    const result = await bookingService.checkPublicAvailability(vehicleId, pickupDate, returnDate);
    return success(res, 'Availability checked successfully.', result);
  } catch (error) {
    next(error);
  }
};

const getVehicleBookedDates = async (req, res, next) => {
  try {
    const dates = await bookingService.getVehicleBookedDates(req.params.vehicleId);
    return success(res, 'Booked dates retrieved successfully.', dates);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  createPublicBooking,
  cancelPublicBooking,
  list,
  getById,
  update,
  updateStatus,
  assignDriver,
  addNote,
  remove,
  checkPublicAvailability,
  getVehicleBookedDates,
};
