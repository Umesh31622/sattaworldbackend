// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const otpLoginStore = {}; // In-memory OTP store for login
// Register
const otpStore = {}; // Temporary in-memory store for OTPs
const nodemailer = require('nodemailer');


router.post('/register/request-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiry = Date.now() + 10 * 60 * 1000; // OTP valid for 10 min

    // Save OTP in memory
    otpStore[email] = { otp, expiry };

    // Send OTP Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      to: email,
      subject: 'Your OTP for Registration',
      text: `Your OTP is ${otp}. It is valid for 10 minutes.`
    });

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
const generateRandomUsername = async () => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username;
  let exists = true;

  while (exists) {
    // Generate random 8-character username
    username = 'user_' + Array.from({ length: 6 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
    // Check if username already exists
    exists = await User.exists({ username });
  }

  return username;
};
// routes/auth.js - Updated register/verify-otp route
router.post('/register/verify-otp', async (req, res) => {
  try {
    const { email, otp, referralCode } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const savedOTP = otpStore[email];
    if (!savedOTP) {
      return res.status(400).json({ message: 'No OTP found for this email. Please request OTP again.' });
    }

    // Verify OTP and expiry
    if (savedOTP.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (savedOTP.expiry < Date.now()) {
      delete otpStore[email];
      return res.status(400).json({ message: 'OTP expired. Please request OTP again.' });
    }

    // Check referralCode if provided
    let referredBy = null;
    if (referralCode) {
      referredBy = await User.findOne({ referralCode });
      if (!referredBy) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    // Generate unique random username
    const randomUsername = await generateRandomUsername();

    // Create user
    const user = new User({
      email,
      username: randomUsername,
      referredBy: referredBy?._id
    });

    await user.save();
    console.log("User registered:", user);

    // NEW: Add 5% referral bonus based on referrer's total deposits
    if (referredBy) {
      // Calculate 5% of referrer's total deposits
      const bonusAmount = Math.floor(referredBy.wallet.totalDeposits * 0.05);
      
      if (bonusAmount > 0) {
        // Add bonus to referrer's wallet
        referredBy.wallet.balance += bonusAmount;
        referredBy.referralEarnings += bonusAmount;
        await referredBy.save();

        // Create a transaction record for the referral bonus
        const Transaction = require('../models/Transaction'); // Make sure to import Transaction model
        const referralTransaction = new Transaction({
          user: referredBy._id,
          type: 'referral',
          amount: bonusAmount,
          paymentMethod: 'wallet',
          description: `5% referral bonus (₹${bonusAmount}) for new signup: ${user.username || user.email}`,
          status: 'completed',
          processedAt: new Date()
        });
        await referralTransaction.save();

        console.log(`Referral bonus of ₹${bonusAmount} credited to ${referredBy.username || referredBy.email}`);
      } else {
        console.log('No referral bonus given - referrer has no deposits yet');
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'Apple',
      { expiresIn: '7d' }
    );

    // Clean up OTP
    delete otpStore[email];

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        wallet: user.wallet,
        isAdmin: user.isAdmin
      },
      // Include referral bonus info if applicable
      referralBonus: referredBy && referredBy.wallet.totalDeposits > 0 ? {
        referrerUsername: referredBy.username || referredBy.email,
        bonusAmount: Math.floor(referredBy.wallet.totalDeposits * 0.05)
      } : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// router.post('/register/verify-otp', async (req, res) => {
//   try {
//     const { email, otp, referralCode } = req.body;

//     if (!email || !otp) {
//       return res.status(400).json({ message: 'Email and OTP are required' });
//     }

//     const savedOTP = otpStore[email];
//     if (!savedOTP) {
//       return res.status(400).json({ message: 'No OTP found for this email. Please request OTP again.' });
//     }

//     // Verify OTP and expiry
//     if (savedOTP.otp !== otp) {
//       return res.status(400).json({ message: 'Invalid OTP' });
//     }
//     if (savedOTP.expiry < Date.now()) {
//       delete otpStore[email];
//       return res.status(400).json({ message: 'OTP expired. Please request OTP again.' });
//     }

//     // Check referralCode if provided
//     let referredBy = null;
//     if (referralCode) {
//       referredBy = await User.findOne({ referralCode });
//       if (!referredBy) {
//         return res.status(400).json({ message: 'Invalid referral code' });
//       }
//     }

//     // Generate unique random username
//     const randomUsername = await generateRandomUsername();

//     // Create user
//     const user = new User({
//       email,
//       username: randomUsername,
     
//       referredBy: referredBy?._id
//     });

//     await user.save();
//     console.log("User registered:", user);

//     // Add referral bonus if applicable
//     if (referredBy) {
//       referredBy.wallet.balance += 50;
//       referredBy.referralEarnings += 50;
//       await referredBy.save();
//     }

//     // Generate JWT token
//     const token = jwt.sign(
//       { userId: user._id },
//       process.env.JWT_SECRET || 'Apple',
//       { expiresIn: '7d' }
//     );

//     // Clean up OTP
//     delete otpStore[email];

//     res.status(201).json({
//       message: 'User registered successfully',
//       token,
//       user: {
//         id: user._id,
//         email: user.email,
//         username: user.username,
//         wallet: user.wallet,
//         isAdmin: user.isAdmin
//       }
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.post('/login/request-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'No user found with this email' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiry = Date.now() + 10 * 60 * 1000; // OTP valid for 10 min

    // Store OTP in memory
    otpLoginStore[email] = { otp, expiry };

    // Send OTP to email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      to: email,
      subject: 'Your OTP for Login',
      text: `Your OTP is ${otp}. It is valid for 10 minutes.`
    });

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.post('/login/verify-otp', async (req, res) => {
    try {
      const { email, otp } = req.body;
  
      if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
      }
  
      const savedOTP = otpLoginStore[email];
      if (!savedOTP) {
        return res.status(400).json({ message: 'No OTP found for this email. Please request OTP again.' });
      }
  
      // Verify OTP and expiry
      if (savedOTP.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }
      if (savedOTP.expiry < Date.now()) {
        delete otpLoginStore[email];
        return res.status(400).json({ message: 'OTP expired. Please request OTP again.' });
      }
  
      // Get the user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: 'No user found with this email' });
      }
  
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
  
      // Clean up OTP
      delete otpLoginStore[email];
  
      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          email: user.email,
          wallet: user.wallet,
          isAdmin: user.isAdmin
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
module.exports = router;
