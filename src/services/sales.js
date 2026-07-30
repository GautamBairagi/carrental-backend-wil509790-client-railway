const prisma = require('../config/db');
const { NotFoundError, BadRequestError } = require('../utils/errors');

// ─────────────────────────────────────────────
// PUBLIC: Get all cars listed for sale
// ─────────────────────────────────────────────
const getSaleCars = async (query = {}) => {
  const { page = 1, limit = 20, category, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    is_for_sale: true,
    is_deleted: false,
    NOT: { status: 'Sold' },
  };

  if (category) {
    where.category = { contains: category };
  }

  if (search) {
    where.OR = [
      { make: { contains: search } },
      { model: { contains: search } },
      { color: { contains: search } },
    ];
  }

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: { media: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    vehicles,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// ─────────────────────────────────────────────
// PUBLIC: Get single sale car by ID
// ─────────────────────────────────────────────
const getSaleCarById = async (id) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, is_for_sale: true, is_deleted: false },
    include: { media: true },
  });

  if (!vehicle) throw new NotFoundError('Sale vehicle not found.');
  return vehicle;
};

// ─────────────────────────────────────────────
// PUBLIC: Submit an inquiry / reservation
// ─────────────────────────────────────────────
const createInquiry = async (vehicleId, data) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, is_for_sale: true, is_deleted: false, NOT: { status: 'Sold' } },
  });

  if (!vehicle) throw new NotFoundError('This vehicle is not available for sale.');

  const { full_name, email, phone, message } = data;
  if (!full_name || !email || !phone) {
    throw new BadRequestError('Name, email, and phone are required.');
  }

  // Generate inquiry number
  const count = await prisma.vehicleSaleInquiry.count();
  const inquiry_number = `INQ-${String(count + 1).padStart(5, '0')}`;

  const inquiry = await prisma.vehicleSaleInquiry.create({
    data: {
      inquiry_number,
      vehicle_id: vehicleId,
      full_name,
      email,
      phone,
      message: message || null,
    },
    include: { vehicle: { include: { media: true } } },
  });

  return inquiry;
};

// ─────────────────────────────────────────────
// ADMIN: List all inquiries
// ─────────────────────────────────────────────
const listInquiries = async (query = {}) => {
  const { page = 1, limit = 20, status, vehicleId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = { is_deleted: false };
  if (status) where.status = status;
  if (vehicleId) where.vehicle_id = vehicleId;

  const [inquiries, total] = await Promise.all([
    prisma.vehicleSaleInquiry.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: { vehicle: { include: { media: true } } },
      orderBy: { created_at: 'desc' },
    }),
    prisma.vehicleSaleInquiry.count({ where }),
  ]);

  return {
    inquiries,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// ─────────────────────────────────────────────
// ADMIN: Get single inquiry
// ─────────────────────────────────────────────
const getInquiryById = async (id) => {
  const inquiry = await prisma.vehicleSaleInquiry.findFirst({
    where: { id, is_deleted: false },
    include: { vehicle: { include: { media: true } } },
  });
  if (!inquiry) throw new NotFoundError('Inquiry not found.');
  return inquiry;
};

// ─────────────────────────────────────────────
// ADMIN: Update inquiry status / notes / fee
// ─────────────────────────────────────────────
const updateInquiry = async (id, data) => {
  const inquiry = await prisma.vehicleSaleInquiry.findFirst({ where: { id, is_deleted: false } });
  if (!inquiry) throw new NotFoundError('Inquiry not found.');

  const { status, admin_notes, reservation_fee_status, transaction_reference } = data;

  const updated = await prisma.vehicleSaleInquiry.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(admin_notes !== undefined && { admin_notes }),
      ...(reservation_fee_status !== undefined && { reservation_fee_status }),
      ...(transaction_reference !== undefined && { transaction_reference }),
    },
    include: { vehicle: { include: { media: true } } },
  });

  return updated;
};

// ─────────────────────────────────────────────
// ADMIN: Mark a vehicle FOR sale (list it)
// ─────────────────────────────────────────────
const listVehicleForSale = async (vehicleId, data) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, is_deleted: false },
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found.');

  const { sale_price, sale_description } = data;
  if (!sale_price || isNaN(parseFloat(sale_price))) {
    throw new BadRequestError('A valid sale price is required.');
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      is_for_sale: true,
      sale_price: parseFloat(sale_price),
      sale_description: sale_description || null,
      // Keep the vehicle's rental status as-is (still rentable until sold)
    },
  });

  return updated;
};

// ─────────────────────────────────────────────
// ADMIN: Remove vehicle from sale listing
// ─────────────────────────────────────────────
const delistVehicleFromSale = async (vehicleId) => {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, is_deleted: false } });
  if (!vehicle) throw new NotFoundError('Vehicle not found.');

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { is_for_sale: false, sale_price: null, sale_description: null },
  });

  return updated;
};

// ─────────────────────────────────────────────
// ADMIN: Mark vehicle as SOLD (final action)
// ─────────────────────────────────────────────
const markVehicleAsSold = async (vehicleId, inquiryId) => {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, is_deleted: false } });
  if (!vehicle) throw new NotFoundError('Vehicle not found.');

  // Update vehicle to Sold status and remove from sale listing
  const updatedVehicle = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      status: 'Sold',
      is_for_sale: false,
    },
  });

  // If an inquiry ID was provided, mark it as Won
  if (inquiryId) {
    await prisma.vehicleSaleInquiry.update({
      where: { id: inquiryId },
      data: { status: 'Won' },
    });

    // Mark all OTHER inquiries for this vehicle as Lost
    await prisma.vehicleSaleInquiry.updateMany({
      where: { vehicle_id: vehicleId, id: { not: inquiryId }, is_deleted: false },
      data: { status: 'Lost' },
    });
  }

  return updatedVehicle;
};

// ─────────────────────────────────────────────
// ADMIN: Sale dashboard stats
// ─────────────────────────────────────────────
const getSaleStats = async () => {
  const [listedCount, soldCount, newInquiries, totalInquiries] = await Promise.all([
    prisma.vehicle.count({ where: { is_for_sale: true, is_deleted: false, NOT: { status: 'Sold' } } }),
    prisma.vehicle.count({ where: { status: 'Sold', is_deleted: false } }),
    prisma.vehicleSaleInquiry.count({ where: { status: 'New', is_deleted: false } }),
    prisma.vehicleSaleInquiry.count({ where: { is_deleted: false } }),
  ]);

  return { listedCount, soldCount, newInquiries, totalInquiries };
};

module.exports = {
  getSaleCars,
  getSaleCarById,
  createInquiry,
  listInquiries,
  getInquiryById,
  updateInquiry,
  listVehicleForSale,
  delistVehicleFromSale,
  markVehicleAsSold,
  getSaleStats,
};
