
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const jwt = require('jsonwebtoken');
const authMiddleware = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      console.log('Incoming Token:', token);
  
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }
  
      const secret = process.env.JWT_SECRET || 'Apple';
      console.log('Using JWT Secret:', secret);
  
      const decoded = jwt.verify(token, secret);
      console.log('Decoded Payload:', decoded);
  
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
  
      req.user = user;
      next();
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      res.status(401).json({ message: 'Token is invalid', error: error.message });
    }
};
// Admin middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);

    const admin = await Admin.findById(decoded.adminId || decoded.userId);
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin JWT Verification Error:', error.message);
    res.status(401).json({ message: 'Token is invalid', error: error.message });
  }
};
// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});
// Get Wallet Details
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Get recent transactions
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      message: 'Wallet details retrieved successfully',
      wallet: user.wallet,
      recentTransactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Create Razorpay Order for Deposit
router.post('/wallet/create-order', authMiddleware, async (req, res) => {
    try {
      const { amount } = req.body;
  
      // Validate amount
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Valid amount is required' });
      }
  
      const settings = await Settings.findOne({});
      const minDeposit = settings?.minimumDeposit || 100;
  
      if (amount < minDeposit) {
        return res.status(400).json({ 
          message: `Minimum deposit amount is ${minDeposit}` 
        });
      }
  
      // Create Razorpay order
      const options = {
        amount: amount * 100, // Razorpay expects amount in paise
        currency: 'INR',
        receipt: `dep_${req.user._id.toString().slice(-6)}_${Date.now().toString().slice(-6)}`,
        notes: {
          userId: req.user._id.toString(),
          type: 'wallet_deposit'
        }
      };
  
      const order = await razorpay.orders.create(options).catch(err => {
        console.error('Razorpay API Error:', err);
        throw new Error('Failed to create Razorpay order');
      });
  
      // Create pending transaction record (awaiting payment)
      const transaction = new Transaction({
        user: req.user._id,
        type: 'deposit',
        amount,
        paymentMethod: 'razorpay',
        paymentDetails: {
          orderId: order.id,
          razorpayOrderId: order.id
        },
        description: 'Deposit via Razorpay',
        status: 'pending' // This will change to 'admin_pending' after payment verification
      });
  
      await transaction.save();
       // ✅ Add amount to Admin's earnings
    const admin = await Admin.findOne(); // You can filter by role or any specific admin ID if needed
    if (admin) {
      admin.earnings += transaction.amount;
      await admin.save();
    }
  
      res.json({
        message: 'Order created successfully',
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          key: process.env.RAZORPAY_KEY
        },
        transactionId: transaction._id
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// Verify Razorpay Payment (No wallet update - requires admin approval)
router.post('/wallet/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      transactionId 
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Find the transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Check if transaction is already processed
    if (transaction.status !== 'pending') {
      return res.status(400).json({ message: 'Transaction already processed' });
    }

    // Update transaction with payment details but set status to admin_pending
    transaction.status = 'admin_pending';
    transaction.paymentDetails = {
      ...transaction.paymentDetails,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      paidAt: new Date()
    };

    await transaction.save();

    res.json({
      message: 'Payment verified successfully. Waiting for admin approval to credit wallet.',
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        status: transaction.status
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Handle Payment Failure
router.post('/wallet/payment-failed', authMiddleware, async (req, res) => {
  try {
    const { transactionId, error } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (transaction) {
      transaction.status = 'failed';
      transaction.paymentDetails = {
        ...transaction.paymentDetails,
        error: error || 'Payment failed',
        failedAt: new Date()
      };
      await transaction.save();
    }

    res.json({
      message: 'Payment failure recorded',
      transaction: {
        id: transaction._id,
        status: transaction.status
      }
    });
  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// ADMIN ROUTES - Get All Deposits (with filters)
router.get('/wallet/admin/deposits', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, userId } = req.query;

    const filter = { type: 'deposit' };
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const deposits = await Transaction.find(filter)
      .populate('user', 'username email')
      .populate('processedBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      message: 'Deposits retrieved successfully',
      deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Withdraw Money (unchanged)
router.post('/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, paymentMethod, mobileNumber } = req.body;

    // Validate inputs
    if (!amount ) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const settings = await Settings.findOne({});
    const minWithdrawal = settings?.minimumWithdrawal || 500;

    if (amount < minWithdrawal) {
      return res.status(400).json({ 
        message: `Minimum withdrawal amount is ${minWithdrawal}` 
      });
    }

    // Check if user has sufficient balance
    const user = await User.findById(req.user._id);
    if (user.wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Check withdrawal timings
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;

    const withdrawalSettings = settings?.withdrawalTimings;
    if (withdrawalSettings && withdrawalSettings.isActive) {
      const startTime = withdrawalSettings.startTime;
      const endTime = withdrawalSettings.endTime;

      if (currentTimeStr < startTime || currentTimeStr > endTime) {
        return res.status(400).json({ 
          message: `Withdrawal is only allowed between ${startTime} and ${endTime}` 
        });
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      user: req.user._id,
      type: 'withdrawal',
      amount,
      paymentMethod,
      paymentDetails: {
        mobileNumber
      },
      description: `Withdrawal via ${paymentMethod}`,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      message: 'Withdrawal request submitted successfully',
      transaction: {
        id: transaction._id,
        amount,
        status: transaction.status,
        paymentMethod
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Transaction History
router.get('/wallet/transactions', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;

    const filter = { user: req.user._id };
    if (type) {
      filter.type = type;
    }

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      message: 'Transaction history retrieved successfully',
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
module.exports = router;