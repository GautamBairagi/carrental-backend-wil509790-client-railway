const express = require('express');
const router = express.Router();
const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

router.get('/auth', (req, res) => {
  try {
    const result = imagekit.getAuthenticationParameters();
    res.json(result);
  } catch (error) {
    console.error('ImageKit Auth Error:', error);
    res.status(500).json({ status: 'fail', message: 'Could not generate ImageKit auth parameters' });
  }
});

module.exports = router;
