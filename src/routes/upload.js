const express = require('express');
const fs = require('fs');
const ImageKit = require('imagekit');
const upload = require('../config/multer');
const { success } = require('../utils/response');

const router = express.Router();

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);

    const result = await imagekit.upload({
      file: fileBuffer,
      fileName: req.file.filename,
      folder: '/novadrive_fleet'
    });

    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error('Failed to delete local temp file:', err);
    }

    return success(res, 'File uploaded successfully to ImageKit.', { fileUrl: result.url }, 201);
  } catch (error) {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
    }
    next(error);
  }
});

module.exports = router;
