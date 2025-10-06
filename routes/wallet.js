// routes/wallet.js
const express = require('express');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get wallet details
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet');
    res.json(user.wallet);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Request deposit
router.post('/deposit', auth, async (req, res) => {
  try {
    const { amount, paymentMethod, mobileNumber } = req.body;
    
    const settings = await Settings.findOne();
    const minDeposit = settings?.minimumDeposit || 100;
    
    if (amount < minDeposit) {
      return res.status(400).json({ 
        message: `Minimum deposit amount is ₹${minDeposit}` 
      });
    }

    const transaction = new Transaction({
      user: req.user._id,
      type: 'deposit',
      amount,
      paymentMethod,
      paymentDetails: {
        mobileNumber
      },
      description: `Deposit request of ₹${amount}`
    });

    await transaction.save();

    res.json({ 
      message: 'Deposit request submitted successfully',
      transaction
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Request withdrawal
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, paymentMethod, mobileNumber } = req.body;
    
    const user = await User.findById(req.user._id);
    const settings = await Settings.findOne();
    const minWithdrawal = settings?.minimumWithdrawal || 500;
    
    if (amount < minWithdrawal) {
      return res.status(400).json({ 
        message: `Minimum withdrawal amount is ₹${minWithdrawal}` 
      });
    }

    if (user.wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Check withdrawal timings
    const now = new Date();
    const currentTime = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
    
    if (settings?.withdrawalTimings?.isActive) {
      const startTime = settings.withdrawalTimings.startTime;
      const endTime = settings.withdrawalTimings.endTime;
      
      if (currentTime < startTime || currentTime > endTime) {
        return res.status(400).json({ 
          message: `Withdrawal requests are only accepted between ${startTime} and ${endTime}` 
        });
      }
    }

    const transaction = new Transaction({
      user: req.user._id,
      type: 'withdrawal',
      amount,
      paymentMethod,
      paymentDetails: {
        mobileNumber
      },
      description: `Withdrawal request of ₹${amount}`
    });

    await transaction.save();

    // Deduct amount from wallet (will be refunded if withdrawal is rejected)
    user.wallet.balance -= amount;
    await user.save();

    res.json({ 
      message: 'Withdrawal request submitted successfully',
      transaction,
      remainingBalance: user.wallet.balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Get transaction history
router.get('/transactions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    
    const filter = { user: req.user._id };
    if (type) filter.type = type;
    
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;
