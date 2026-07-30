const { BadRequestError } = require('../utils/errors');

const validateCreateContract = (req, res, next) => {
  const { bookingId, contractContent } = req.body;

  if (!bookingId || typeof bookingId !== 'string') {
    return next(new BadRequestError('Booking ID is required.'));
  }

  if (!contractContent || typeof contractContent !== 'string' || !contractContent.trim()) {
    return next(new BadRequestError('Contract content text is required.'));
  }

  next();
};

const validateSignContract = (req, res, next) => {
  const { signatureType, typedSignature, signatureImage, ipAddress, pdfUrl } = req.body;

  if (!signatureType || !['TYPE', 'DRAW'].includes(signatureType)) {
    return next(new BadRequestError('A valid signature type (TYPE, DRAW) is required.'));
  }

  if (signatureType === 'TYPE' && (!typedSignature || typeof typedSignature !== 'string' || !typedSignature.trim())) {
    return next(new BadRequestError('Typed signature string is required when signature type is TYPE.'));
  }

  if (signatureType === 'DRAW' && (!signatureImage || typeof signatureImage !== 'string' || !signatureImage.trim())) {
    return next(new BadRequestError('Drawn signature image URL/Base64 is required when signature type is DRAW.'));
  }

  if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.trim()) {
    return next(new BadRequestError('Client IP address is required for audit trail.'));
  }

  if (pdfUrl && (typeof pdfUrl !== 'string' || !pdfUrl.trim())) {
    return next(new BadRequestError('PDF URL must be a non-empty string.'));
  }

  next();
};

const validateStatusNotes = (req, res, next) => {
  const { notes } = req.body;

  if (notes && typeof notes !== 'string') {
    return next(new BadRequestError('Status update notes must be a string value.'));
  }

  next();
};

module.exports = {
  validateCreateContract,
  validateSignContract,
  validateStatusNotes,
};
