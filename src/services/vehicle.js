const prisma = require('../config/db');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const auditService = require('./audit');

// Helper to map DB enum to clean response statuses
const mapStatusToResponse = (status) => {
  if (status === 'In_Trip') return 'In Trip';
  if (status === 'Out_Of_Service') return 'Out Of Service';
  return status;
};

// Helper to map request status to DB enum
const mapStatusToDB = (status) => {
  if (status === 'In Trip') return 'In_Trip';
  if (status === 'Out Of Service') return 'Out_Of_Service';
  return status;
};

const createVehicle = async (vehicleBody, currentUserId, currentUserRole) => {
  // Only ADMIN can create vehicles
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Admin users are permitted to create vehicles.');
  }

  const { 
    plateNumber, vin, make, model, year, color, category, dailyRentalRate,
    transmission, seats, fuelType, topSpeed, range, horsepower, doorsCount,
    securityDeposit, minimumRentalDays, insuranceExpiry, registrationExpiry,
    lastServiceDate, nextServiceDate, media
  } = vehicleBody;

  // Check unique plate
  const existingPlate = await prisma.vehicle.findUnique({
    where: { plate_number: plateNumber },
  });
  if (existingPlate && !existingPlate.is_deleted) {
    throw new BadRequestError('Plate number is already registered.');
  }

  // Check unique VIN
  const existingVIN = await prisma.vehicle.findUnique({
    where: { vin },
  });
  if (existingVIN && !existingVIN.is_deleted) {
    throw new BadRequestError('VIN is already registered.');
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plate_number: plateNumber,
      vin,
      make,
      model,
      year: parseInt(year, 10),
      color,
      category,
      daily_rental_rate: dailyRentalRate,
      created_by: currentUserId,
      transmission: transmission || undefined,
      seats: seats !== undefined ? parseInt(seats, 10) : undefined,
      fuel_type: fuelType || undefined,
      top_speed: topSpeed !== undefined ? parseInt(topSpeed, 10) : undefined,
      range: range !== undefined ? parseInt(range, 10) : undefined,
      horsepower: horsepower !== undefined ? parseInt(horsepower, 10) : undefined,
      doors_count: doorsCount !== undefined ? parseInt(doorsCount, 10) : undefined,
      security_deposit: securityDeposit !== undefined ? parseFloat(securityDeposit) : undefined,
      minimum_rental_days: minimumRentalDays !== undefined ? parseInt(minimumRentalDays, 10) : undefined,
      insurance_expiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
      registration_expiry: registrationExpiry ? new Date(registrationExpiry) : null,
      last_service_date: lastServiceDate ? new Date(lastServiceDate) : null,
      next_service_date: nextServiceDate ? new Date(nextServiceDate) : null,
      media: media && media.length > 0 ? {
        create: media.map(m => ({
          file_url: m.fileUrl,
          is_cover: m.isCover || false
        }))
      } : undefined
    },
    include: {
      media: true
    }
  });

  await auditService.logAction(
    currentUserId,
    'Vehicle Created',
    'VEHICLE',
    vehicle.id,
    null,
    { id: vehicle.id, plate_number: vehicle.plate_number, make: vehicle.make, model: vehicle.model }
  );

  return {
    ...vehicle,
    status: mapStatusToResponse(vehicle.status),
  };
};

const getVehicles = async (queryFilters) => {
  const { page = 1, limit = 10, search = '', status, category, make, model, plateNumber } = queryFilters;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const take = parseInt(limit, 10);

  const where = { is_deleted: false };

  if (status) {
    where.status = mapStatusToDB(status);
  } else {
    // By default, exclude Sold vehicles from the rental catalog listing
    where.NOT = { status: 'Sold' };
  }

  if (category) {
    where.category = category;
  }

  if (make) {
    where.make = make;
  }

  if (model) {
    where.model = model;
  }

  if (plateNumber) {
    where.plate_number = plateNumber;
  }

  if (search) {
    where.OR = [
      { make: { contains: search } },
      { model: { contains: search } },
      { plate_number: { contains: search } },
      { vin: { contains: search } },
    ];
  }

  const [vehicles, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: { media: true },
    }),
    prisma.vehicle.count({ where }),
  ]);

  const vehiclesResponse = vehicles.map((v) => ({
    ...v,
    status: mapStatusToResponse(v.status),
  }));

  return {
    vehicles: vehiclesResponse,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const getVehicleById = async (id) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      documents: true,
      maintenances: { orderBy: { service_date: 'desc' } },
      media: true,
    },
  });

  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  return {
    ...vehicle,
    status: mapStatusToResponse(vehicle.status),
  };
};

const updateVehicle = async (id, vehicleBody, currentUserId, currentUserRole) => {
  // Only ADMIN can modify core vehicle master info
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Admin users are permitted to edit vehicle master info.');
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  const { 
    plateNumber, vin, make, model, year, color, category, dailyRentalRate,
    transmission, seats, fuelType, topSpeed, range, horsepower, doorsCount,
    securityDeposit, minimumRentalDays, insuranceExpiry, registrationExpiry,
    lastServiceDate, nextServiceDate, media
  } = vehicleBody;

  // Check unique constraint on plate
  if (plateNumber && plateNumber !== vehicle.plate_number) {
    const existingPlate = await prisma.vehicle.findUnique({ where: { plate_number: plateNumber } });
    if (existingPlate && !existingPlate.is_deleted) {
      throw new BadRequestError('Plate number is already registered.');
    }
  }

  // Check unique constraint on VIN
  if (vin && vin !== vehicle.vin) {
    const existingVIN = await prisma.vehicle.findUnique({ where: { vin } });
    if (existingVIN && !existingVIN.is_deleted) {
      throw new BadRequestError('VIN is already registered.');
    }
  }

  if (media !== undefined) {
    await prisma.vehicleMedia.deleteMany({
      where: { vehicle_id: id }
    });
    if (media && media.length > 0) {
      await prisma.vehicleMedia.createMany({
        data: media.map(m => ({
          vehicle_id: id,
          file_url: m.fileUrl,
          is_cover: m.isCover || false
        }))
      });
    }
  }

  const updated = await prisma.vehicle.update({
    where: { id },
    data: {
      plate_number: plateNumber,
      vin,
      make,
      model,
      year: year ? parseInt(year, 10) : undefined,
      color,
      category,
      daily_rental_rate: dailyRentalRate,
      updated_by: currentUserId,
      transmission: transmission || undefined,
      seats: seats !== undefined ? parseInt(seats, 10) : undefined,
      fuel_type: fuelType || undefined,
      top_speed: topSpeed !== undefined ? parseInt(topSpeed, 10) : undefined,
      range: range !== undefined ? parseInt(range, 10) : undefined,
      horsepower: horsepower !== undefined ? parseInt(horsepower, 10) : undefined,
      doors_count: doorsCount !== undefined ? parseInt(doorsCount, 10) : undefined,
      security_deposit: securityDeposit !== undefined ? parseFloat(securityDeposit) : undefined,
      minimum_rental_days: minimumRentalDays !== undefined ? parseInt(minimumRentalDays, 10) : undefined,
      insurance_expiry: insuranceExpiry ? new Date(insuranceExpiry) : undefined,
      registration_expiry: registrationExpiry ? new Date(registrationExpiry) : undefined,
      last_service_date: lastServiceDate ? new Date(lastServiceDate) : undefined,
      next_service_date: nextServiceDate ? new Date(nextServiceDate) : undefined
    },
    include: {
      media: true
    }
  });

  return {
    ...updated,
    status: mapStatusToResponse(updated.status),
  };
};

const updateVehicleStatus = async (id, status, currentUserId) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  const updated = await prisma.vehicle.update({
    where: { id },
    data: {
      status: mapStatusToDB(status),
      updated_by: currentUserId,
    },
  });

  return {
    ...updated,
    status: mapStatusToResponse(updated.status),
  };
};

const softDeleteVehicle = async (id, currentUserId, currentUserRole) => {
  // Only ADMIN can delete vehicles
  if (currentUserRole !== 'ADMIN') {
    throw new ForbiddenError('Only Admin users are permitted to delete vehicles.');
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  await prisma.vehicle.update({
    where: { id },
    data: {
      is_deleted: true,
      updated_by: currentUserId,
    },
  });
};

const addDocument = async (id, docBody) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  const { documentType, documentNumber, expiryDate, fileUrl } = docBody;

  const doc = await prisma.vehicleDocument.create({
    data: {
      vehicle_id: id,
      document_type: documentType,
      document_number: documentNumber,
      expiry_date: new Date(expiryDate),
      file_url: fileUrl,
    },
  });

  return doc;
};

const addMaintenance = async (id, maintBody) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  const { serviceDate, nextServiceDate, currentMileage, nextServiceMileage, notes } = maintBody;

  const maint = await prisma.vehicleMaintenance.create({
    data: {
      vehicle_id: id,
      service_date: new Date(serviceDate),
      next_service_date: new Date(nextServiceDate),
      current_mileage: currentMileage,
      next_service_mileage: nextServiceMileage,
      notes: notes || null,
    },
  });

  return maint;
};

const addMedia = async (id, mediaBody) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.is_deleted) {
    throw new NotFoundError('Vehicle not found.');
  }

  const { fileUrl, isCover } = mediaBody;

  // If isCover is true, unset any existing cover photo for this vehicle
  if (isCover) {
    await prisma.vehicleMedia.updateMany({
      where: { vehicle_id: id, is_cover: true },
      data: { is_cover: false },
    });
  }

  const media = await prisma.vehicleMedia.create({
    data: {
      vehicle_id: id,
      file_url: fileUrl,
      is_cover: isCover || false,
    },
  });

  return media;
};

module.exports = {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  updateVehicleStatus,
  softDeleteVehicle,
  addDocument,
  addMaintenance,
  addMedia,
};
