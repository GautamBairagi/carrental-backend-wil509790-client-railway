const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { BadRequestError } = require('../utils/errors');

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter validation (All common image formats and PDFs)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /\.(jpeg|jpg|png|webp|gif|svg|avif|heic|heif|bmp|tiff|jfif|pdf)$/i;
  const isImageMime = file.mimetype ? (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream') : false;
  const isAllowedExt = allowedExtensions.test(file.originalname);

  if (isImageMime || isAllowedExt) {
    return cb(null, true);
  }
  cb(new BadRequestError('Only image files (JPG, PNG, WEBP, GIF, SVG, HEIC, etc.) and PDFs are allowed.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

module.exports = upload;

