const express = require('express');
const fs = require('fs');
const ImageKit = require('imagekit');
const upload = require('../config/multer');
const { success } = require('../utils/response');

const router = express.Router();

let imagekit = null;
if (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
  try {
    imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
    });
  } catch (err) {
    console.error('ImageKit initialization error:', err);
  }
}

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
    }

    let fileUrl = null;

    if (imagekit) {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const result = await imagekit.upload({
          file: fileBuffer,
          fileName: req.file.filename,
          folder: '/novadrive_fleet'
        });

        if (result && result.url) {
          fileUrl = result.url;
          try {
            fs.unlinkSync(req.file.path);
          } catch (err) {}
        }
      } catch (ikErr) {
        console.warn('ImageKit upload error, falling back to local file storage:', ikErr.message);
      }
    }

    if (!fileUrl) {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:5000';
      fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    }

    return success(res, 'File uploaded successfully.', { fileUrl }, 201);
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
    }
    next(error);
  }
});

module.exports = router;

