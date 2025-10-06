const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const Settings = require('../models/AdminSetting');
const Admin = require('../models/Admin');
const cloudinary = require('../utils/cloudinary'); // adjust path
const fs = require('fs');
// Use Multer with memoryStorage since we don't need to store files locally
const storage = multer.memoryStorage();
const streamifier = require('streamifier');
// Helper function to upload to Cloudinary
// Enhanced upload function with better error handling
const uploadToCloudinary = async (file) => {
    if (!file) return null;
    
    try {
    //   console.log(`Uploading file: ${file.originalname}`);
      // Use file.buffer instead of file.path for memory storage
      const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
        folder: 'payment_qrs',
        resource_type: 'auto'
      });
    //   console.log('Upload successful:', result.secure_url);
      return result.secure_url;
    } catch (error) {
    //   console.error('Cloudinary upload failed:', error.message);
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  };
  
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});
// Middleware to verify admin token
const adminMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const secret = process.env.JWT_SECRET || 'Apple';
    const decoded = jwt.verify(token, secret);

    const admin = await Admin.findById(decoded.adminId || decoded.userId);
    if (!admin) return res.status(401).json({ message: 'Admin not found' });

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};
// GET: Get current settings
router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    res.json({ message: 'Settings retrieved successfully', settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// PUT: Update payment details
// router.put('/settings/payment-details', adminMiddleware, async (req, res) => {
//   try {
//     const { bankDetails, upiDetails, paytmDetails, googlePayDetails } = req.body;

//     let settings = await Settings.findOne({});
//     if (!settings) settings = new Settings({});

//     if (bankDetails) settings.adminPaymentDetails.bankDetails = {
//       ...settings.adminPaymentDetails.bankDetails,
//       ...bankDetails
//     };

//     if (upiDetails) settings.adminPaymentDetails.upiDetails = {
//       ...settings.adminPaymentDetails.upiDetails,
//       ...upiDetails
//     };

//     if (paytmDetails) settings.adminPaymentDetails.paytmDetails = {
//       ...settings.adminPaymentDetails.paytmDetails,
//       ...paytmDetails
//     };

//     if (googlePayDetails) settings.adminPaymentDetails.googlePayDetails = {
//       ...settings.adminPaymentDetails.googlePayDetails,
//       ...googlePayDetails
//     };

//     await settings.save();

//     res.json({
//       message: 'Payment details updated successfully',
//       settings: settings.adminPaymentDetails
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// This route now handles multipart/form-data with image uploads
// PUT /settings/payment-details

// Configure Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});



router.put('/settings/payment-details', adminMiddleware, upload.fields([
  { name: 'upiQr', maxCount: 1 },
  { name: 'paytmQr', maxCount: 1 },
  { name: 'gpayQr', maxCount: 1 },
]), async (req, res) => {
  try {
    // console.log('Request files:', req.files); // Debug log
    // console.log('Request body:', req.body); // Debug log

    const { bankDetails, upiDetails, paytmDetails, googlePayDetails } = req.body;
    const { upiQr, paytmQr, gpayQr } = req.files || {};

    let settings = await Settings.findOne({});
    if (!settings) settings = new Settings({});

    // Process file uploads in parallel
    let upiQrUrl, paytmQrUrl, gpayQrUrl;
    try {
      [upiQrUrl, paytmQrUrl, gpayQrUrl] = await Promise.all([
        upiQr?.[0] ? uploadToCloudinary(upiQr[0]) : null,
        paytmQr?.[0] ? uploadToCloudinary(paytmQr[0]) : null,
        gpayQr?.[0] ? uploadToCloudinary(gpayQr[0]) : null
      ]);
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      return res.status(400).json({ 
        message: 'File upload failed',
        error: uploadError.message 
      });
    }

    // Helper function to parse input
    const parseInput = (input) => {
      if (!input) return {};
      return typeof input === 'string' ? JSON.parse(input) : input;
    };

    // Update bank details
    if (bankDetails) {
      settings.adminPaymentDetails.bankDetails = {
        ...settings.adminPaymentDetails.bankDetails,
        ...parseInput(bankDetails)
      };
    }

    // Update UPI details
    if (upiDetails || upiQrUrl) {
      settings.adminPaymentDetails.upiDetails = {
        ...settings.adminPaymentDetails.upiDetails,
        ...parseInput(upiDetails),
        upiQr: upiQrUrl || settings.adminPaymentDetails.upiDetails.upiQr
      };
    }

    // Update Paytm details
    if (paytmDetails || paytmQrUrl) {
      settings.adminPaymentDetails.paytmDetails = {
        ...settings.adminPaymentDetails.paytmDetails,
        ...parseInput(paytmDetails),
        paytmQr: paytmQrUrl || settings.adminPaymentDetails.paytmDetails.paytmQr
      };
    }

    // Update Google Pay details
    if (googlePayDetails || gpayQrUrl) {
      settings.adminPaymentDetails.googlePayDetails = {
        ...settings.adminPaymentDetails.googlePayDetails,
        ...parseInput(googlePayDetails),
        gpayQr: gpayQrUrl || settings.adminPaymentDetails.googlePayDetails.gpayQr
      };
    }

    await settings.save();

    res.json({
      message: 'Payment details updated successfully',
      settings: settings.adminPaymentDetails
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// POST: Upload QR code for a specific payment method
router.post('/settings/upload-qr/:paymentType', adminMiddleware, upload.single('qrCode'), async (req, res) => {
    try {
      const { paymentType } = req.params;
  
      if (!req.file) {
        return res.status(400).json({ message: 'QR code image is required' });
      }
  
      if (!['upi', 'paytm', 'googlepay'].includes(paymentType)) {
        return res.status(400).json({ message: 'Invalid payment type' });
      }
  
      // Stream upload to Cloudinary
      const uploadToCloudinary = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'qr-codes',
              resource_type: 'image'
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };
      
  
      const result = await uploadToCloudinary();
      const qrCodeUrl = result.secure_url;
  
      // Update settings
      let settings = await Settings.findOne({});
      if (!settings) settings = new Settings({});
  
      if (paymentType === 'upi') {
        settings.adminPaymentDetails.upiDetails.qrCodeUrl = qrCodeUrl;
      } else if (paymentType === 'paytm') {
        settings.adminPaymentDetails.paytmDetails.qrCodeUrl = qrCodeUrl;
      } else if (paymentType === 'googlepay') {
        settings.adminPaymentDetails.googlePayDetails.qrCodeUrl = qrCodeUrl;
      }
  
      await settings.save();
  
      res.json({
        message: `${paymentType.toUpperCase()} QR code uploaded successfully`,
        qrCodeUrl
      });
  
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
module.exports = router;





// const cloudinary = require('cloudinary').v2;

// // Configure Cloudinary (should be at the top of your file)
// cloudinary.config({ 
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
//   api_key: process.env.CLOUDINARY_API_KEY, 
//   api_secret: process.env.CLOUDINARY_API_SECRET 
// });

// // Helper function to upload to Cloudinary
// const uploadToCloudinary = async (file) => {
//   try {
//     if (!file) return null;
//     const result = await cloudinary.uploader.upload(file.path);
//     return result.secure_url;
//   } catch (error) {
//     console.error('Cloudinary upload error:', error);
//     return null;
//   }
// };

