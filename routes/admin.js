
// routes/admin.js
const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const mongoose = require('mongoose');
const Game = require('../models/Game');
const GameRate = require('../models/GameRate');
const Bet = require('../models/Bet');
const HardGame = require("../models/HardGame");
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const STATIC_ADMIN_USERNAME = 'admin';
const Notice = require("../models/Notice")
const STATIC_ADMIN_PASSWORD = 'admin@21';
const router = express.Router();
const cloudinary = require("../utils/cloudinary")
const ResultScheduler = require('../utils/resultScheduler');
const AdminSettings = require("../models/AdminSetting")
const { adminAuth } = require('../middleware/auth');
const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'user_profiles' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary Upload Error:', error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        stream.end(fileBuffer);
      });
};
// JWT Authentication Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
          return res.status(401).json({ message: 'No token provided' });
        }
    
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
    
        req.user = user;
        next();
      } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
      }
};
// Add this function to check and publish draft results
const publishScheduledResults = async () => {
  try {
    const now = new Date();
    const draftResults = await Result.find({
      status: 'draft',
      scheduledPublishTime: { $lte: now }
    }).populate('gameId');

    for (const result of draftResults) {
      // Update the result status
      result.status = 'published';
      result.declaredAt = now;
      await result.save();

      // Run the same bet update logic as in your original route
      const { gameId, date, openResult, closeResult } = result;

      if (openResult !== undefined) {
        await Bet.updateMany(
          { 
            gameId: gameId._id, 
            date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
            session: 'open',
            status: 'pending'
          },
          [
            {
              $set: {
                status: { $cond: [{ $eq: ['$number', openResult] }, 'won', 'lost'] },
                winAmount: { $cond: [{ $eq: ['$number', openResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
                resultDate: now
              }
            }
          ]
        );
      }

      if (closeResult !== undefined) {
        await Bet.updateMany(
          { 
            gameId: gameId._id, 
            date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
            session: 'close',
            status: 'pending'
          },
          [
            {
              $set: {
                status: { $cond: [{ $eq: ['$number', closeResult] }, 'won', 'lost'] },
                winAmount: { $cond: [{ $eq: ['$number', closeResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
                resultDate: now
              }
            }
          ]
        );
      }

      // Update user balances for winning bets
      const winningBets = await Bet.find({
        gameId: gameId._id,
        date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
        status: 'won'
      });

      for (const bet of winningBets) {
        await User.findByIdAndUpdate(bet.userId, {
          $inc: { balance: bet.winAmount, totalWinnings: bet.winAmount }
        });
      }

      console.log(`Published scheduled result for game ${gameId.name}`);
    }
  } catch (error) {
    console.error('Error publishing scheduled results:', error);
  }
};

// Run the scheduler every minute
setInterval(publishScheduledResults, 60000);
const upload = require("../utils/upload");
// === ADMIN SIGNUP ===
router.post('/signup', async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
      }
  
      // Check if username or email already exists
      const existingAdmin = await Admin.findOne({
        $or: [{ username }, { email }]
      });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }
  
      // Create new admin
      const admin = new Admin({
        username,
        email,
        password,  // Will be hashed by the pre-save middleware
        role: 'admin' // Fixed role
      });
  
      await admin.save();
  
      res.status(201).json({
        message: 'Admin registered successfully',
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
  // === ADMIN LOGIN ===
router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
  
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }
  
      // Find admin by username
      const admin = await Admin.findOne({ username });
      if (!admin) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Compare password
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Update last login
      admin.lastLogin = new Date();
      await admin.save();
  
      // Generate JWT Token
      const token = jwt.sign(
        { adminId: admin._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
  
      res.status(200).json({
        message: 'Login successful',
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// Change Password
router.post('/change-password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const admin = await Admin.findById(req.admin.id);
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.put('/update', adminAuth, upload.single('profileImage'), async (req, res) => {
  try {
    const {
      username,
      email,
      isActive
    } = req.body;

    const admin = req.admin; // Get logged-in admin from token

    // ✅ Upload profile image to Cloudinary if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      admin.profileImage = result.secure_url; // Save Cloudinary URL
    }

    // ✅ Update other fields
    if (username) admin.username = username;
    if (email) admin.email = email.toLowerCase();
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    res.status(200).json({
      message: 'Admin profile updated successfully',
      admin
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ message: 'Server error while updating admin', error: error.message });
  }
});
router.get('/admin-earnings',adminAuth, async (req, res) => {
  try {
    // ✅ Sum all bet amounts from Bet collection
    const totalBets = await Bet.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$betAmount" } } }
    ]);
    const normalBetsTotal = totalBets[0]?.totalAmount || 0;

    // ✅ Sum all bet amounts from HardGame collection
    const totalHardBets = await HardGame.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$betAmount" } } }
    ]);
    const hardGameBetsTotal = totalHardBets[0]?.totalAmount || 0;

    // ✅ Combine both totals
    const totalUserInvestments = normalBetsTotal + hardGameBetsTotal;

    // ✅ Get admin earnings
    const admin = await Admin.findOne();
    const adminEarnings = admin ? admin.earnings : 0;

    // ✅ Send response
    res.status(200).json({
      message: "Summary retrieved successfully",
      totalUserInvestments,
      adminEarnings
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch summary" });
  }
});
router.get('/profiles', async (req, res) => {
  try {
    const admins = await Admin.find().select('-password'); // exclude password
    res.status(200).json({
      message: 'Admin profiles fetched successfully',
      data: admins
    });
  } catch (error) {
    console.error('Error fetching admin profiles:', error);
    res.status(500).json({
      message: 'Server error while fetching admin profiles',
      error: error.message
    });
  }
});
//Route: Get total user count
router.get('/users-count', async (req, res) => {
    try {
      const userCount = await User.countDocuments();
      res.json({
        message: 'User count retrieved successfully',
        count: userCount
      });
    } catch (error) {
      console.error('Error fetching user count:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
  // Get Total Bid Amount
// router.get('/total-bid-amount', async (req, res) => {
//   try {
//     // Get total bet amount from Bet collection
//     const betResult = await Bet.aggregate([
//       {
//         $group: {
//           _id: null,
//           totalAmount: { $sum: "$betAmount" }
//         }
//       }
//     ]);

//     // Get total bet amount from HardGame collection
//     const hardGameResult = await HardGame.aggregate([
//       {
//         $group: {
//           _id: null,
//           totalAmount: { $sum: "$betAmount" }
//         }
//       }
//     ]);

//     const totalBetAmount = (betResult[0]?.totalAmount || 0) + (hardGameResult[0]?.totalAmount || 0);

//     res.status(200).json({
//       message: "Total bid amount retrieved successfully",
//       totalBidAmount: totalBetAmount
//     });
//   } catch (error) {
//     console.error("Error getting total bid amount:", error);
//     res.status(500).json({ message: "Server error while fetching total bid amount" });
//   }
// });
// Get Admin's total bid amount
router.get('/total-bid-amount', async (req, res) => {
  try {
    const admin = await Admin.findOne({ role: 'admin' }); // or use {_id: specificId} if needed

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({
      message: "Admin bid amount retrieved successfully",
      bidAmount: admin.bidAmount
    });
  } catch (error) {
    console.error("Error retrieving admin bid amount:", error);
    res.status(500).json({ message: "Server error while fetching bid amount" });
  }
});

// 2. USER MANAGEMENT
// Get all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sortBy = 'registrationDate', order = 'desc' } = req.query;
    
    const query = search ? {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const users = await User.find(query)
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-password');

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get user details
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('referredBy', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's betting history
    const bets = await Bet.find({ userId: user._id })
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(10);

    // Get user's transaction history
    const transactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      user,
      recentBets: bets,
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Block/Unblock user
router.patch('/users/:id/block', adminAuth, async (req, res) => {
  try {
    const { isBlocked } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Add points to user
router.post('/users/:id/add-points', adminAuth, async (req, res) => {
    try {
      const { amount, notes } = req.body;
  
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Ensure amount is a number
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }
  
      // Initialize balance if it's null or undefined
      if (user.balance == null) user.balance = 0;
  
      user.balance += numericAmount;
      await user.save();
  
      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: 'deposit',
        amount: numericAmount,
        status: 'completed',
        paymentMethod: 'wallet',
        description: notes || 'Points added by admin',
        adminNotes: notes || 'Points added by admin',
        processedAt: new Date()
      });
      await transaction.save();
  
      res.json({
        success: true,
        message: 'Points added successfully',
        user: {
          id: user._id,
          username: user.username,
          balance: user.balance
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// ✅ Get all games with dynamic rates
router.get('/testing-games', async (req, res) => {
  try {
    const games = await Game.find({}); // Or use filter like { status: 'active' }

    const enrichedGames = await Promise.all(games.map(async (game) => {
      const rates = await GameRate.find({ gameId: game._id });

      const rateMap = {};
      for (const rate of rates) {
        // Convert snake_case to camelCase keys (optional but cleaner)
        if (rate.rateType === 'single_digit') {
          rateMap.singleDigit = rate.rate;
        } else if (rate.rateType === 'jodi_digit') {
          rateMap.jodiDigit = rate.rate;
        } else {
          rateMap[rate.rateType] = rate.rate; // fallback for any other rate types
        }
      }

      return {
        ...game.toObject(),
        rates: rateMap
      };
    }));

    res.json({
      success: true,
      games: enrichedGames
    });
  } catch (error) {
    console.error('Error in GET /games:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/games', adminAuth, async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });

    const enrichedGames = await Promise.all(games.map(async (game) => {
      const rates = await GameRate.find({ gameId: game._id });

      // Build rate object as expected in your current format
      const rateMap = {
        singleDigit: 9,  // default if not found
        jodiDigit: 950   // default if not found
      };

      rates.forEach(rate => {
        if (rate.rateType === 'single_digit') {
          rateMap.singleDigit = rate.rate;
        } else if (rate.rateType === 'jodi_digit') {
          rateMap.jodiDigit = rate.rate;
        }
      });

      // Inject updated rates into the existing game object
      return {
        ...game.toObject(),
        rates: rateMap
      };
    }));

    res.json({
      success: true,
      games: enrichedGames
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// // Get all games
// router.get('/games', adminAuth, async (req, res) => {
//   try {
//     const games = await Game.find()
//     .sort({ createdAt: -1 });
  

//     res.json({
//       success: true,
//       games
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
// // Add new game
router.post('/games', adminAuth, async (req, res) => {
  try {
    const { name, gameType, openDateTime, closeDateTime, resultDateTime, status } = req.body;

    // Check if game name already exists
    // Check if game name already exists
    const existingGame = await Game.findOne({ name });
    if (existingGame) {
      return res.status(400).json({ message: 'Game name already exists' });
    }

    const now = new Date();

    const openTime = new Date(openDateTime);
    const closeTime = new Date(closeDateTime);
    const resultTime = new Date(resultDateTime);

    // Check: Open, Close, Result times cannot be in the past
    if (openTime < now) {
      return res.status(400).json({ message: 'Open time cannot be in the past' });
    }

    if (closeTime < now) {
      return res.status(400).json({ message: 'Close time cannot be in the past' });
    }

    if (resultTime < now) {
      return res.status(400).json({ message: 'Result time cannot be in the past' });
    }

    // Check: Open time must be before Close time
    if (openTime >= closeTime) {
      return res.status(400).json({ message: 'Open time must be before Close time' });
    }

    // Check: Close time must be before Result time
    if (closeTime >= resultTime) {
      return res.status(400).json({ message: 'Close time must be before Result time' });
    }

    const game = new Game({
      name,
      gameType,
      openDateTime, // parse to Date
      closeDateTime,
      resultDateTime,
      status
    });

    await game.save();

    res.json({
      success: true,
      message: 'Game added successfully',
      game
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// router.post('/games', adminAuth, async (req, res) => {
//   try {
//     const { name, type, openTime, closeTime, resultTime, status } = req.body;
    
//     const game = new Game({
//       name,
//       type,
//       openTime,
//       closeTime,
//       resultTime,
//       status
//     });

//     await game.save();

//     res.json({
//       success: true,
//       message: 'Game added successfully',
//       game
//     });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res.status(400).json({ message: 'Game name already exists' });
//     }
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
// Update game

router.put('/games/:id', async (req, res) => {
  try {
    const { name, type, openTime, closeTime, resultTime, status } = req.body;
    
    const game = await Game.findByIdAndUpdate(
      req.params.id,
      { name, type, openTime, closeTime, resultTime, status, updatedAt: new Date() },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({
      success: true,
      message: 'Game updated successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Delete game
// Hard delete a game by ID
// router.delete('/testing-games/:id', async (req, res) => {
//   try {
//     const game = await Game.findByIdAndDelete(req.params.id);

//     if (!game) {
//       return res.status(404).json({ message: 'Game not found' });
//     }

//     res.json({
//       success: true,
//       message: 'Game permanently deleted',
//       game
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.delete('/testing-games/:id', async (req, res) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Delete related results
    await Result.deleteMany({ gameId: game._id });

    // Delete related bets
    await Bet.deleteMany({ gameId: game._id });

    res.json({
      success: true,
      message: 'Game and associated results/bets deleted successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 4. GAME RATES MANAGEMENT
// =======
router.get('/games/:gameId/rates', adminAuth, async (req, res) => {
// >>>>>>> 9f878bf (Initial commit for SataShreejiBackend)
  try {
    const rates = await GameRate.find({ gameId: req.params.gameId })
      .populate('gameId', 'name');

    res.json({
      success: true,
      rates
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Add/Update game rate
router.post('/games/:gameId/rates', adminAuth, async (req, res) => {
  try {
    const { rateType, rate, minBet, maxBet } = req.body;
    
    let gameRate = await GameRate.findOne({
      gameId: req.params.gameId,
      rateType
    });

    if (gameRate) {
      gameRate.rate = rate;
      gameRate.minBet = minBet;
      gameRate.maxBet = maxBet;
      await gameRate.save();
    } else {
      gameRate = new GameRate({
        gameId: req.params.gameId,
        rateType,
        rate,
        minBet,
        maxBet
      });
      await gameRate.save();
    }

    res.json({
      success: true,
      message: 'Rate updated successfully',
      rate: gameRate
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.delete('/user/:userId', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// 5. RESULT MANAGEMENT
// Get results for a game

// Get results for a game (with active filter)
router.get('/games/:gameId/results', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, includeExpired = false } = req.query;
    
    let query = { gameId: req.params.gameId };
    
    // Optionally filter out expired results
    if (!includeExpired) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      query.declaredAt = { $gt: twentyFourHoursAgo };
    }
    
    const results = await Result.find(query)
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Result.countDocuments(query);

    res.json({
      success: true,
      results,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// router.get('/games/:gameId/results', adminAuth, async (req, res) => {
//   try {
//     const { page = 1, limit = 10 } = req.query;
    
//     const results = await Result.find({ gameId: req.params.gameId })
//       .populate('gameId', 'name')
//       .sort({ date: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);

//     const total = await Result.countDocuments({ gameId: req.params.gameId });

//     res.json({
//       success: true,
//       results,
//       pagination: {
//         current: page,
//         pages: Math.ceil(total / limit),
//         total
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
// Declare result
// router.post('/games/:gameId/results', adminAuth, async (req, res) => {
//   try {
//     const { date, openResult, closeResult, spinnerResult } = req.body;
//     const gameId = req.params.gameId;

//      // Fetch the game to access the scheduled resultDateTime
//      const game = await Game.findById(gameId);
//      if (!game) {
//        return res.status(404).json({ message: 'Game not found' });
//      }
 
//      // Check if current time is before the game's scheduled result time
//      const now = new Date();
//      if (now < new Date(game.resultDateTime)) {
//        return res.status(400).json({ message: 'Result cannot be declared before the scheduled result time' });
//      }
//     const result = new Result({   
//       gameId: req.params.gameId,
//       date: new Date(date),
//       openResult,
//       closeResult,
//       spinnerResult
//     });

//     await result.save();

//     // Update bet results
//     if (openResult !== undefined) {
//       await Bet.updateMany(
//         { 
//           gameId: req.params.gameId, 
//           date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
//           session: 'open',
//           status: 'pending'
//         },
//         [
//           {
//             $set: {
//               status: { $cond: [{ $eq: ['$number', openResult] }, 'won', 'lost'] },
//               winAmount: { $cond: [{ $eq: ['$number', openResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
//               resultDate: new Date()
//             }
//           }
//         ]
//       );
//     }

//     if (closeResult !== undefined) {
//       await Bet.updateMany(
//         { 
//           gameId: req.params.gameId, 
//           date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
//           session: 'close',
//           status: 'pending'
//         },
//         [
//           {
//             $set: {
//               status: { $cond: [{ $eq: ['$number', closeResult] }, 'won', 'lost'] },
//               winAmount: { $cond: [{ $eq: ['$number', closeResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
//               resultDate: new Date()
//             }
//           }
//         ]
//       );
//     }

//     // Update user balances for winning bets
//     const winningBets = await Bet.find({
//       gameId: req.params.gameId,
//       date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
//       status: 'won'
//     });

//     for (const bet of winningBets) {
//       await User.findByIdAndUpdate(bet.userId, {
//         $inc: { balance: bet.winAmount, totalWinnings: bet.winAmount }
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Result declared successfully',
//       result
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// Declare result with auto-deletion
router.post('/games/:gameId/results', adminAuth, async (req, res) => {
  try {
    const { date, openResult, closeResult, spinnerResult } = req.body;
    const gameId = req.params.gameId;

    // Fetch the game to access the scheduled resultDateTime
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Check if current time is before the game's scheduled result time
    const now = new Date();
    if (now < new Date(game.resultDateTime)) {
      return res.status(400).json({ message: 'Result cannot be declared before the scheduled result time' });
    }

    const result = new Result({   
      gameId: req.params.gameId,
      date: new Date(date),
      openResult,
      closeResult,
      spinnerResult,
      declaredAt: new Date(),
      // expiresAt is automatically set by schema default
    });

    await result.save();


    const deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    ResultScheduler.scheduleResultDeletion(result._id, deleteAt);
  
    // Update bet results (existing logic)
    if (openResult !== undefined) {
      await Bet.updateMany(
        { 
          gameId: req.params.gameId, 
          date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
          session: 'open',
          status: 'pending'
        },
        [
          {
            $set: {
              status: { $cond: [{ $eq: ['$number', openResult] }, 'won', 'lost'] },
              winAmount: { $cond: [{ $eq: ['$number', openResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
              resultDate: new Date()
            }
          }
        ]
      );
    }

    if (closeResult !== undefined) {
      await Bet.updateMany(
        { 
          gameId: req.params.gameId, 
          date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
          session: 'close',
          status: 'pending'
        },
        [
          {
            $set: {
              status: { $cond: [{ $eq: ['$number', closeResult] }, 'won', 'lost'] },
              winAmount: { $cond: [{ $eq: ['$number', closeResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
              resultDate: new Date()
            }
          }
        ]
      );
    }

    // Update user balances for winning bets
    const winningBets = await Bet.find({
      gameId: req.params.gameId,
      date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
      status: 'won'
    });

    for (const bet of winningBets) {
      await User.findByIdAndUpdate(bet.userId, {
        $inc: { balance: bet.winAmount, totalWinnings: bet.winAmount }
      });
    }

    res.json({
      success: true,
      message: 'Result declared successfully',
      result,
      autoDeleteAt: new Date(result.declaredAt.getTime() + 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Manual cleanup endpoint (optional)
router.delete('/results/cleanup', adminAuth, async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const deletedResults = await Result.deleteMany({
      declaredAt: { $lte: twentyFourHoursAgo }
    });

    res.json({
      success: true,
      message: `Cleaned up ${deletedResults.deletedCount} expired results`,
      deletedCount: deletedResults.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get result expiry status
router.get('/results/:resultId/expiry', adminAuth, async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId);
    
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    const now = new Date();
    const expiryTime = new Date(result.declaredAt.getTime() + 24 * 60 * 60 * 1000);
    const timeUntilExpiry = expiryTime.getTime() - now.getTime();
    const isExpired = timeUntilExpiry <= 0;

    res.json({
      success: true,
      result: {
        id: result._id,
        declaredAt: result.declaredAt,
        expiryTime,
        timeUntilExpiry: Math.max(0, timeUntilExpiry),
        isExpired,
        hoursUntilExpiry: Math.max(0, Math.ceil(timeUntilExpiry / (60 * 60 * 1000)))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Declare result
router.post('/testing-games/:gameId/results', adminAuth, async (req, res) => {
  try {
    const { date, openResult, closeResult, spinnerResult } = req.body;
    const gameId = req.params.gameId;

     // Fetch the game to access the scheduled resultDateTime
     const game = await Game.findById(gameId);
     if (!game) {
       return res.status(404).json({ message: 'Game not found' });
     }
 
     // Check if current time is before the game's scheduled result time
     const now = new Date();
     const isDraft = now < new Date(game.resultDateTime);
     
     const result = new Result({   
      gameId: req.params.gameId,
      date: new Date(date),
      openResult,
      closeResult,
      spinnerResult,
      status: isDraft ? 'draft' : 'published',  // ⬅️ Set status based on timing
      scheduledPublishTime: isDraft ? game.resultDateTime : undefined  // ⬅️ Set schedule time if draft
    });

    await result.save();

    // Only update bets and balances if not a draft
    if (!isDraft) {
      // Update bet results
      if (openResult !== undefined) {
        await Bet.updateMany(
          { 
            gameId: req.params.gameId, 
            date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
            session: 'open',
            status: 'pending'
          },
          [
            {
              $set: {
                status: { $cond: [{ $eq: ['$number', openResult] }, 'won', 'lost'] },
                winAmount: { $cond: [{ $eq: ['$number', openResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
                resultDate: new Date()
              }
            }
          ]
        );
      }

      if (closeResult !== undefined) {
        await Bet.updateMany(
          { 
            gameId: req.params.gameId, 
            date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
            session: 'close',
            status: 'pending'
          },
          [
            {
              $set: {
                status: { $cond: [{ $eq: ['$number', closeResult] }, 'won', 'lost'] },
                winAmount: { $cond: [{ $eq: ['$number', closeResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
                resultDate: new Date()
              }
            }
          ]
        );
      }

      // Update user balances for winning bets
      const winningBets = await Bet.find({
        gameId: req.params.gameId,
        date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
        status: 'won'
      });

      for (const bet of winningBets) {
        await User.findByIdAndUpdate(bet.userId, {
          $inc: { balance: bet.winAmount, totalWinnings: bet.winAmount }
        });
      }
    }

    res.json({
      success: true,
      message: isDraft ? 'Result saved as draft and will be published automatically' : 'Result declared successfully',
      result,
      isDraft  // ⬅️ Let frontend know if it's a draft
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get bets for a game
router.get('/games/:gameId/bets', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, date, session } = req.query;
    
    let query = { gameId: req.params.gameId };
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate.getTime() + 24*60*60*1000);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    if (session) {
      query.session = session;
    }

    const bets = await Bet.find(query)
      .populate('userId', 'username mobile')
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Bet.countDocuments(query);

    // Get betting summary
    const summary = await Bet.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$number',
          totalAmount: { $sum: '$amount' },
          totalBets: { $sum: 1 },
          users: { $addToSet: '$userId' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      success: true,
      bets,
      summary,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// 7. TRANSACTION MANAGEMENT
// Get withdrawal requests
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'pending' } = req.query;
    
    const withdrawals = await Transaction.find({
      type: 'withdrawal',
      status
    })
      .populate('userId', 'username mobile email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({
      type: 'withdrawal',
      status
    });

    res.json({
      success: true,
      withdrawals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Process withdrawal
router.patch('/withdrawals/:id', adminAuth, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    const withdrawal = await Transaction.findById(req.params.id)
      .populate('userId');

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    withdrawal.status = status;
    withdrawal.adminNotes = adminNotes;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    // If rejected, return money to user balance
    if (status === 'rejected') {
      await User.findByIdAndUpdate(withdrawal.userId._id, {
        $inc: { balance: withdrawal.amount }
      });
    }

    res.json({
      success: true,
      message: `Withdrawal ${status} successfully`,
      withdrawal
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Bet report
router.get('/reports/bets', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, gameId } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (gameId) {
      query.gameId = gameId;
    }

    const report = await Bet.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            gameId: '$gameId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          },
          totalBets: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalWinAmount: { $sum: '$winAmount' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $lookup: {
          from: 'games',
          localField: '_id.gameId',
          foreignField: '_id',
          as: 'game'
        }
      },
      { $sort: { '_id.date': -1 } }
    ]);

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// User report
router.get('/reports/users', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.registrationDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const totalUsers = await User.countDocuments(query);
    const activeUsers = await User.countDocuments({ ...query, isActive: true });
    const blockedUsers = await User.countDocuments({ ...query, isBlocked: true });

    const userStats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalDeposits: { $sum: '$totalDeposits' },
          totalWithdrawals: { $sum: '$totalWithdrawals' },
          totalWinnings: { $sum: '$totalWinnings' }
        }
      }
    ]);

    res.json({
      success: true,
      report: {
        totalUsers,
        activeUsers,
        blockedUsers,
        stats: userStats[0] || {
          totalBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalWinnings: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// // GET /games/:gameId/investors
// router.get('/:gameId/investors', async (req, res) => {
//   try {
//     const { gameId } = req.params;

//     // Find all bets for the specified game and populate user details
//     const bets = await Bet.find({ game: gameId })
//       .populate('user', 'username email profileImage') // get only needed user fields
//       .sort({ createdAt: -1 }); // newest first

//     // Format the response
//     const investors = bets.map(bet => ({
//       userId: bet.user._id,
//       username: bet.user.username,
//       email: bet.user.email,
//       profileImage: bet.user.profileImage,
//       betAmount: bet.betAmount,
//       betNumber: bet.betNumber,
//       betType: bet.betType,
//       session: bet.session,
//       status: bet.status,
//       createdAt: bet.createdAt
//     }));

//     return res.status(200).json({
//       success: true,
//       gameId,
//       totalInvestors: investors.length,
//       investors
//     });
//   } catch (error) {
//     console.error('Error fetching investors:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Something went wrong. Please try again later.'
//     });
//   }
// });
// GET /games/:gameId/investors
// GET /games/:gameId/investors
router.get('/testing/:gameId/investors', async (req, res) => {
  try {
    const { gameId } = req.params;

    // Find all bets for the specified game and populate user details
    const bets = await Bet.find({ game: gameId })
      .populate('user', 'username email profileImage')
      .sort({ createdAt: -1 });

    const userMap = new Map();

    bets.forEach(bet => {
      const userId = bet.user._id.toString();

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId: bet.user._id,
          username: bet.user.username,
          email: bet.user.email,
          profileImage: bet.user.profileImage,
          totalBetAmount: 0,
          betHistory: []
        });
      }

      const userEntry = userMap.get(userId);
      userEntry.totalBetAmount += bet.totalBetAmount; // ✅ FIXED HERE

      userEntry.betHistory.push({
        betNumbers: bet.betNumbers,               // ✅ Include full bet numbers with amounts
        totalBetAmount: bet.totalBetAmount,       // ✅ Include total
        betType: bet.betType,
        session: bet.session,
        status: bet.status,
        createdAt: bet.createdAt
      });
    });

    const investors = Array.from(userMap.values());

    return res.status(200).json({
      success: true,
      gameId,
      totalInvestors: investors.length,
      investors
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.'
    });
  }
});
// GET /games/:gameId/investors?sort=highest OR sort=lowest
router.get('/testing/:gameId/investors', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { sort = 'highest' } = req.query; // default to highest

    // Fetch all bets for the game
    const bets = await Bet.find({ game: gameId })
      .populate('user', 'username email profileImage')
      .sort({ createdAt: -1 });

    // Map to group by user
    const userMap = new Map();

    bets.forEach(bet => {
      const userId = bet.user._id.toString();

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId: bet.user._id,
          username: bet.user.username,
          email: bet.user.email,
          profileImage: bet.user.profileImage,
          totalBetAmount: 0,
          betHistory: []
        });
      }

      const userEntry = userMap.get(userId);
      userEntry.totalBetAmount += bet.totalBetAmount;

      userEntry.betHistory.push({
        betNumbers: bet.betNumbers,
        totalBetAmount: bet.totalBetAmount,
        betType: bet.betType,
        session: bet.session,
        status: bet.status,
        createdAt: bet.createdAt
      });
    });

    let investors = Array.from(userMap.values());

    // 🔽 Apply sorting
    if (sort === 'lowest') {
      investors.sort((a, b) => a.totalBetAmount - b.totalBetAmount);
    } else {
      investors.sort((a, b) => b.totalBetAmount - a.totalBetAmount);
    }

    return res.status(200).json({
      success: true,
      gameId,
      totalInvestors: investors.length,
      investors
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.'
    });
  }
});

// API to get bets by game for a user
router.get('/user-bets/game/:gameId', async (req, res) => {
  try {
      const { gameId,userId  } = req.params;


      
      const bets = await Bet.find({ 
          user: userId, 
          game: gameId 
      })
      .populate('game', 'name openDateTime closeDateTime resultDateTime status rates')
      .sort({ createdAt: -1 });
      
      // Get game results if available
      const results = await Result.find({ gameId }).sort({ date: -1 }).limit(5);
      
      res.json({
          success: true,
          data: {
              bets,
              gameResults: results
          }
      });
  } catch (error) {
      console.error('Error fetching user game bets:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// GET /games/:gameId/investors?sort=highest OR ?sort=lowest
router.get('/games/:gameId/investors', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { sort } = req.query;

    // Determine sort order based on query
    const sortOrder = sort === 'lowest' ? 1 : -1; // default to highest first

    // Find all bets for the specified game, sorted by betAmount
    const bets = await Bet.find({ game: gameId })
      .populate('user', 'username email profileImage') // populate user details
      .sort({ betAmount: sortOrder }); // sort by bet amount

    // Format response
    const investors = bets.map(bet => ({
      userId: bet.user._id,
      username: bet.user.username,
      email: bet.user.email,
      profileImage: bet.user.profileImage,
      betAmount: bet.betAmount,
      betNumber: bet.betNumber,
      betType: bet.betType,
      session: bet.session,
      status: bet.status,
      createdAt: bet.createdAt
    }));

    res.status(200).json({
      success: true,
      gameId,
      totalInvestors: investors.length,
      investors
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch investors for this game.'
    });
  }
});
// Get winners for a specific game with optional date filter
router.get('/games/:gameId/winners', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { 
      date,
      betType,
      page = 1,
      limit = 10 
    } = req.query;

    // Build query object
    const query = { 
      game: gameId,
      status: 'won', // Only get winning bets
      isWinner: true
    };

    // Add date filter if provided
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.betDate = { $gte: startDate, $lte: endDate };
    }

    // Add bet type filter if provided
    if (betType) {
      query.betType = betType;
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count of winning bets
    const total = await Bet.countDocuments(query);

    // Get winning bets with pagination
    const winners = await Bet.find(query)
      .populate('user', 'username email mobile') // Include user details
      .populate('game', 'name gameType') // Include game details
      .sort({ betDate: -1 }) // Sort by latest first
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate summary statistics
    const summary = await Bet.aggregate([
      { $match: query },
      { $group: {
        _id: '$betType',
        totalBets: { $sum: 1 },
        totalWinAmount: { $sum: '$winningAmount' },
        totalBetAmount: { $sum: '$betAmount' }
      }}
    ]);

    // Format response data
    const formattedWinners = winners.map(win => ({
      betId: win.betId,
      user: {
        username: win.user.username,
        email: win.user.email,
        mobile: win.user.mobile
      },
      game: {
        name: win.game.name,
        type: win.game.gameType
      },
      betType: win.betType,
      betNumber: win.betNumber,
      betAmount: win.betAmount,
      winningAmount: win.winningAmount,
      resultNumber: win.resultNumber,
      betDate: win.betDate,
      session: win.session
    }));

    res.status(200).json({
      success: true,
      data: {
        winners: formattedWinners,
        summary: {
          totalWinners: total,
          betTypeSummary: summary,
          totalWinAmount: summary.reduce((acc, curr) => acc + curr.totalWinAmount, 0),
          totalBetAmount: summary.reduce((acc, curr) => acc + curr.totalBetAmount, 0)
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching winners:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching winners',
      error: error.message
    });
  }
});
// Get specific winner details
router.get('/games/:gameId/winners/:betId', adminAuth, async (req, res) => {
  try {
    const { gameId, betId } = req.params;

    const winnerDetails = await Bet.findOne({
      game: gameId,
      betId,
      status: 'won',
      isWinner: true
    })
    .populate('user', 'username email mobile')
    .populate('game', 'name gameType');

    if (!winnerDetails) {
      return res.status(404).json({
        success: false,
        message: 'Winner record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        betId: winnerDetails.betId,
        user: {
          username: winnerDetails.user.username,
          email: winnerDetails.user.email,
          mobile: winnerDetails.user.mobile
        },
        game: {
          name: winnerDetails.game.name,
          type: winnerDetails.game.gameType
        },
        betType: winnerDetails.betType,
        betNumber: winnerDetails.betNumber,
        betAmount: winnerDetails.betAmount,
        winningAmount: winnerDetails.winningAmount,
        resultNumber: winnerDetails.resultNumber,
        betDate: winnerDetails.betDate,
        session: winnerDetails.session
      }
    });

  } catch (error) {
    console.error('Error fetching winner details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching winner details',
      error: error.message
    });
  }
});
// 9. TRANSACTION MANAGEMENT
router.get('/transactions/pending',  adminAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: 'pending' })
      .populate('user', 'username email')
      .sort({ createdAt: -1 });

    res.json({
      message: 'Pending transactions retrieved successfully',
      transactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// router.post('/transactionss/:transactionId/action', adminAuth, async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const { action, adminNotes } = req.body;

//     const transaction = await Transaction.findById(transactionId);
//     if (!transaction) {
//       return res.status(404).json({ message: 'Transaction not found' });
//     }

//     if (transaction.status !== 'pending' && transaction.status !== 'admin_pending') {
//       return res.status(400).json({ message: 'Transaction is not pending' });
//     }

//     // Process based on admin's action
//     if (action === 'approve') {
//       transaction.status = 'completed';
//       transaction.adminNotes = adminNotes;
//       transaction.processedAt = new Date();
//       transaction.processedBy = req.admin._id;

//       // Update user wallet
//       const user = await User.findById(transaction.user);
//       if (!user) {
//         return res.status(404).json({ message: 'User not found' });
//       }

//       if (transaction.type === 'deposit') {
//         user.wallet.balance += transaction.amount;
//         user.wallet.totalDeposits += transaction.amount;

//         // Check if user was referred by someone
//         if (user.referredBy) {
//           const referrer = await User.findById(user.referredBy);
//           if (referrer) {
//             const bonusAmount = Math.floor(transaction.amount * 0.05); // 5% referral bonus
//             if (bonusAmount > 0) {
//               referrer.referralEarnings += bonusAmount;
//               referrer.wallet.commission += bonusAmount;
//               await referrer.save();

//               // Log referral bonus transaction
//               const referralTransaction = new Transaction({
//                 user: referrer._id,
//                 type: 'referral',
//                 amount: bonusAmount,
//                 paymentMethod: 'wallet',
//                 description: `5% referral commission from ${user.username || user.email}'s deposit`,
//                 status: 'completed',
//                 processedAt: new Date()
//               });
//               await referralTransaction.save();
//             }
//           }
//         }
//       }

//       await user.save();
//     } else if (action === 'reject') {
//       transaction.status = 'failed';
//       transaction.adminNotes = adminNotes;
//       transaction.processedAt = new Date();
//       transaction.processedBy = req.admin._id;
//     } else {
//       return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'." });
//     }

//     await transaction.save();

//     res.json({
//       message: `Transaction ${action}ed successfully`,
//       transaction: {
//         id: transaction._id,
//         status: transaction.status,
//         processedAt: transaction.processedAt
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// Updated admin transaction approval route (remove old referral bonus logic)
router.post('/transactions/:transactionId/action', adminAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { action, adminNotes } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.status !== 'pending' && transaction.status !== 'admin_pending') {
      return res.status(400).json({ message: 'Transaction is not pending' });
    }

    // Process based on admin's action
   // inside the approve block
if (action === 'approve') {
  transaction.status = 'completed';
  transaction.adminNotes = adminNotes;
  transaction.processedAt = new Date();
  transaction.processedBy = req.admin._id;

  // Update user wallet
  const user = await User.findById(transaction.user);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (transaction.type === 'deposit') {
    user.wallet.balance += transaction.amount;
    user.wallet.totalDeposits += transaction.amount;

    console.log(`Deposited ₹${transaction.amount} to ${user.username || user.email}`);
    console.log(`Updated wallet balance: ₹${user.wallet.balance}`);

    // Check if user was referred by someone
    if (user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) {
        const bonusAmount = Math.floor(transaction.amount * 0.05); // 5% referral bonus
        console.log(`User ${user.username || user.email} was referred by ${referrer.username || referrer.email}`);
        console.log(`Referral Bonus Calculated: ₹${bonusAmount}`);

        if (bonusAmount > 0) {
          referrer.referralEarnings += bonusAmount;
          referrer.wallet.commission += bonusAmount;

          console.log(`Before saving: ${referrer.username || referrer.email} had ₹${referrer.wallet.commission - bonusAmount} commission`);
          console.log(`After saving: ${referrer.username || referrer.email} will have ₹${referrer.wallet.commission} commission`);
          
          await referrer.save();

          // Log referral bonus transaction
          const referralTransaction = new Transaction({
            user: referrer._id,
            type: 'referral',
            amount: bonusAmount,
            paymentMethod: 'wallet',
            description: `5% referral commission from ${user.username || user.email}'s deposit`,
            status: 'completed',
            processedAt: new Date()
          });

          await referralTransaction.save();
          console.log(`Referral transaction saved: ₹${bonusAmount} to ${referrer.username || referrer.email}`);
        }
      } else {
        console.log(`ReferredBy ID not found: ${user.referredBy}`);
      }
    }
  }

  await user.save();
    } else if (action === 'reject') {
      transaction.status = 'failed';
      transaction.adminNotes = adminNotes;
      transaction.processedAt = new Date();
      transaction.processedBy = req.admin._id;
    } else {
      return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'." });
    }

    await transaction.save();

    res.json({
      message: `Transaction ${action}ed successfully`,
      transaction: {
        id: transaction._id,
        status: transaction.status,
        processedAt: transaction.processedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// router.post('/transactions/:transactionId/action', adminAuth, async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const { action, adminNotes } = req.body;

//     const transaction = await Transaction.findById(transactionId);
//     if (!transaction) {
//       return res.status(404).json({ message: 'Transaction not found' });
//     }

//     if (transaction.status !== 'pending' && transaction.status !== 'admin_pending') {
//   return res.status(400).json({ message: 'Transaction is not pending' });
// }


//     // Process based on admin's action
//     if (action === 'approve') {
//       transaction.status = 'completed';
//       transaction.adminNotes = adminNotes;
//       transaction.processedAt = new Date();
//    transaction.processedBy = req.admin._id;


//       // Update user wallet
//       const user = await User.findById(transaction.user);
//       if (!user) {
//         return res.status(404).json({ message: 'User not found' });
//       }

//       if (transaction.type === 'deposit') {
//         user.wallet.balance += transaction.amount;
//         user.wallet.totalDeposits += transaction.amount;

//         // Handle first deposit referral bonus
//         if (user.referredBy && user.wallet.totalDeposits === transaction.amount) {
//           const referrer = await User.findById(user.referredBy);
//           if (referrer) {
//             const settings = await Settings.findOne({});
//             const referralBonus = settings?.referralBonus || 50;

//             referrer.wallet.balance += referralBonus;
//             referrer.referralEarnings += referralBonus;
//             await referrer.save();

//             // Create referral bonus transaction
//             const referralTransaction = new Transaction({
//               user: referrer._id,
//               type: 'referral_bonus',
//               amount: referralBonus,
//               paymentMethod: 'wallet',
//               description: `Referral bonus for ${user.username || user.email}`,
//               status: 'completed'
//             });
//             await referralTransaction.save();
//           }
//         }
//       }

//       await user.save();
//     } else if (action === 'reject') {
//       transaction.status = 'failed';
//       transaction.adminNotes = adminNotes;
//       transaction.processedAt = new Date();
//      transaction.processedBy = req.admin._id;

//     } else {
//       return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'." });
//     }

//     await transaction.save();

//     res.json({
//       message: `Transaction ${action}ed successfully`,
//       transaction: {
//         id: transaction._id,
//         status: transaction.status,
//         processedAt: transaction.processedAt
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
//Get transaction statistics
router.get('/transactions/stats',adminAuth, async (req, res) => {
  try {
    const stats = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      message: 'Transaction statistics retrieved successfully',
      stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /admin/withdrawals
router.get('/users-withdrawals', adminAuth, async (req, res) => {
  try {
    // 🔥 Only fetch withdrawals that are pending admin approval
    const withdrawals = await Transaction.find({ status: 'admin_pending' })
      .populate('user', 'username email wallet')
      .sort({ createdAt: -1 }); // Most recent first

    res.status(200).json({
      message: 'Pending withdrawals fetched successfully',
      withdrawals
    });
  } catch (error) {
    console.error('Fetch pending withdrawals error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// POST /admin/withdrawals/:id/approve
router.post('/users-withdrawalstesting/:id/approve', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
   

    // ✅ Find transaction
    const transaction = await Transaction.findById(id).populate('user');
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }


    // ✅ Check if user exists
    const user = transaction.user;
  

    if (!user) {
      return res.status(404).json({ message: 'User linked to this transaction does not exist' });
    }
    if (transaction.status !== 'pending' && transaction.status !== 'admin_pending') {
      return res.status(400).json({ message: 'Transaction is not pending approval' });
    }
    

    // ✅ Check user balance
    if (user.wallet.balance < transaction.amount) {
      return res.status(400).json({ message: 'User has insufficient balance' });
    }

    // ✅ Deduct balance
    user.wallet.balance -= transaction.amount;
    user.wallet.totalWithdrawals += transaction.amount;
    await user.save();

    // ✅ Update transaction
    transaction.status = 'completed';
    transaction.processedAt = new Date();
    transaction.processedBy = req.admin._id;
    await transaction.save();

    res.status(200).json({ message: 'Withdrawal approved successfully' });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// POST /admin/withdrawals/:id/reject
router.post('/users-withdrawals/:id/reject', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // Optional rejection reason

    // ✅ Find transaction
    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    if (transaction.status !== 'admin_pending') {
      return res.status(400).json({ message: 'Transaction is not pending approval' });
    }

    // ✅ Update transaction
    transaction.status = 'cancelled';
    transaction.adminNotes = reason || 'Rejected by admin';
    transaction.processedAt = new Date();
    transaction.processedBy = req.admin._id;
    await transaction.save();

    res.status(200).json({ message: 'Withdrawal request rejected successfully' });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /admin/withdrawals/approved
router.get('/users-withdrawals/approved', adminAuth, async (req, res) => {
  try {
    // 🔥 Fetch withdrawals approved by admin
    const approvedWithdrawals = await Transaction.find({ status: 'completed' })
      .populate('user', 'username email wallet')
      .sort({ processedAt: -1 }); // Most recent first

    res.status(200).json({
      message: 'Approved withdrawals fetched successfully',
      withdrawals: approvedWithdrawals
    });
  } catch (error) {
    console.error('Fetch approved withdrawals error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /admin/withdrawals
router.get('/users-withdrawals-testing', adminAuth, async (req, res) => {
  try {
    const { status } = req.query; // 🔥 Filter by status if provided

    let query = { type: 'withdrawal' }; // Only withdrawals

    if (status) {
      // If status is passed (e.g., ?status=completed)
      query.status = status;
    }

    const withdrawals = await Transaction.find(query)
      .populate('user', 'username email wallet')
      .sort({ createdAt: -1 }); // Most recent first

    res.status(200).json({
      message: 'Withdrawals fetched successfully',
      withdrawals
    });
  } catch (error) {
    console.error('Fetch withdrawals error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
//deposits of the users
router.get('/testing-transactions/deposits', async (req, res) => {
  try {
    const { status } = req.query;

    // Build filter
    let filter = { type: 'deposit' };

    if (status) {
      const statusMap = {
        rejected: 'failed',
        approved: 'completed',
        pending: ['pending', 'admin_pending'], // include admin_pending as pending
      };

      const normalizedStatus = statusMap[status.toLowerCase()] || status.toLowerCase();

      filter.status = normalizedStatus;
    }

    // Fetch transactions
    const transactions = await Transaction.find(filter)
      .populate('user', 'username email profileImage')
      .sort({ createdAt: -1 })
      .lean(); // Get plain JS objects to modify

    // Normalize admin_pending → pending
    transactions.forEach(txn => {
      if (txn.status === 'admin_pending') {
        txn.status = 'pending';
      }
    });

    res.status(200).json({
      success: true,
      count: transactions.length,
      message: 'Deposit transactions retrieved successfully',
      transactions,
    });
  } catch (error) {
    console.error('Error fetching deposit transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit transactions',
      error: error.message,
    });
  }
});
// router.get('/testing-transactions/deposits', async (req, res) => {
//   try {
//     const { status } = req.query;

//     // Build filter
//     let filter = { type: 'deposit' };

//     if (status) {
//       // Normalize and map statuses if needed
//       const statusMap = {
//         rejected: 'failed',
//         approved: 'completed',
//               pending: ['pending', 'admin_pending'], // include admin_pending as pending

//       };

//       const normalizedStatus = statusMap[status.toLowerCase()] || status.toLowerCase();

//       filter.status = normalizedStatus;
//     }

//     // Fetch transactions
//     const transactions = await Transaction.find(filter)
//       .populate('user', 'username email profileImage')
//       .sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       count: transactions.length,
//       message: 'Deposit transactions retrieved successfully',
//       transactions,
//     });
//   } catch (error) {
//     console.error('Error fetching deposit transactions:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch deposit transactions',
//       error: error.message,
//     });
//   }
// });

//upload new. notices 
// ✅ Create a new notice
router.post('/notices', adminAuth, async (req, res) => {
  try {
    const { title, description } = req.body;
    const adminId = req.admin._id; // Admin ID from auth middleware

    const newNotice = new Notice({
      title,
      description,
      createdBy: adminId
    });

    await newNotice.save();

    res.status(201).json({
      message: 'Notice created successfully',
      notice: newNotice
    });
  } catch (err) {
    console.error('Create Notice Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ✅ Get all notices (latest first)
router.get('/notices', adminAuth, async (req, res) => {
  try {
    const notices = await Notice.find()
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Notices retrieved successfully',
      notices
    });
  } catch (err) {
    console.error('Get Notices Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ✅ Update a notice
router.put('/notices/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    const updatedNotice = await Notice.findByIdAndUpdate(
      id,
      { title, description },
      { new: true, runValidators: true }
    );

    if (!updatedNotice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    res.status(200).json({
      message: 'Notice updated successfully',
      notice: updatedNotice
    });
  } catch (err) {
    console.error('Update Notice Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ✅ Delete a notice
router.delete('/notices/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedNotice = await Notice.findByIdAndDelete(id);

    if (!deletedNotice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    res.status(200).json({
      message: 'Notice deleted successfully'
    });
  } catch (err) {
    console.error('Delete Notice Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Admin creates a new Hard Game session
// router.post('/admin/hardgame/create', adminAuth, async (req, res) => {
//   try {
//     const { gameName, nextResultTime } = req.body;

//     const newHardGame = new HardGame({
//       gameName,
//       nextResultTime
//     });

//     await newHardGame.save();

//     res.status(201).json({
//       message: 'Hard game created successfully',
//       hardGame: newHardGame
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.post('/admin/hardgame/create', adminAuth, async (req, res) => {
  try {
    const { gameName, nextResultTime } = req.body;

    // ✅ Check if there is already a HardGame in the database
    const existingGameCount = await HardGame.countDocuments();
    if (existingGameCount >= 1) {
      return res.status(400).json({
        message: 'Only one Hard game is allowed at a time. Delete the existing one before creating a new one.'
      });
    }

    // ✅ Create new HardGame
    const newHardGame = new HardGame({
      gameName,
      nextResultTime
    });

    await newHardGame.save();

    res.status(201).json({
      message: 'Hard game created successfully',
      hardGame: newHardGame
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Admin declares result for Hard Game
router.post('/admin/hardgame/declare', adminAuth, async (req, res) => {
  try {
    const { gameId, resultDigit } = req.body;

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'Invalid game ID' });
    }
    if (resultDigit < 0 || resultDigit > 9) {
      return res.status(400).json({ message: 'Result digit must be between 0 and 9' });
    }

    // Find all user bets for this hard game
    const userBets = await HardGame.find({
      _id: gameId,
      status: 'pending'
    });

    // if (userBets.length === 0) {
    //   return res.status(404).json({ message: 'No pending bets found for this hard game' });
    // }

    let winners = 0;
    for (const bet of userBets) {
      if (bet.selectedNumber === resultDigit) {
        bet.resultNumber = resultDigit;
        bet.status = 'won';
        bet.winningAmount = bet.betAmount * 9; // Example payout multiplier
        winners++;

        // Credit user wallet
        const user = await User.findById(bet.user);
        if (user) {
          user.walletBalance += bet.winningAmount;
          await user.save();
        }
      } else {
        bet.resultNumber = resultDigit;
        bet.status = 'lost';
        bet.winningAmount = 0;
      }
      await bet.save();
    }

    res.status(200).json({
      message: `Result declared successfully for game ID ${gameId}`,
      resultDigit,
      totalParticipants: userBets.length,
      totalWinners: winners
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/admin/hardgame',  async (req, res) => {
  try {
    const hardGames = await HardGame.find().sort({ createdAt: -1 }); // latest first
    res.status(200).json({
      message: 'Hard games fetched successfully',
      hardGames: hardGames
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET admin payment details
router.get('/admins-settings', async (req, res) => {
  try {
    const settings = await AdminSettings.findOne({});
    if (!settings) {
      return res.status(404).json({ message: 'Admin settings not found' });
    }

    res.status(200).json({
      message: 'Admin settings fetched successfully',
      data: {
        adminPaymentDetails: settings.adminPaymentDetails,
        minimumDeposit: settings.minimumDeposit,
        minimumWithdrawal: settings.minimumWithdrawal,
        withdrawalTimings: settings.withdrawalTimings,
        paymentInstructions: settings.paymentInstructions,
        autoApproval: settings.autoApproval
      }
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({ message: 'Server error while fetching admin settings' });
  }
});
// Get All Transactions (Deposits & Withdrawals) for Admin
router.get('/wallet/admin/transactions', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, userId } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (userId) filter.user = userId;

    const transactions = await Transaction.find(filter)
      .populate('user', 'username email')
      .populate('processedBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      message: 'Transactions retrieved successfully',
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
// Get Single Transaction Details for Admin
router.get('/wallet/admin/transaction/:id',adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
    .populate('user', 'username email wallet depositScreenshots') // include screenshots
    .populate('processedBy', 'username email');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({
      message: 'Transaction details retrieved successfully',
      transaction
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Approve Transaction (Deposit/Withdrawal)(working fine)
router.post('/wallet/admin/approve/:id', adminAuth, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const transactionId = req.params.id;

    const transaction = await Transaction.findById(transactionId).populate('user');
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.status !== 'admin_pending') {
      return res.status(400).json({ message: 'Transaction cannot be approved' });
    }

    const user = await User.findById(transaction.user._id);

    if (transaction.type === 'deposit') {
      // Add money to user's wallet
      user.wallet.balance += transaction.amount;
      user.wallet.totalDeposits += transaction.amount;

      // Add to admin earnings
      const admin = await Admin.findById(req.admin._id);
      if (admin) {
        admin.earnings += transaction.amount;
        await admin.save();
      }
    } else if (transaction.type === 'withdrawal') {
      // Deduct money from user's wallet
      if (user.wallet.balance < transaction.amount) {
        return res.status(400).json({ message: 'User has insufficient balance' });
      }
      user.wallet.balance -= transaction.amount;
      user.wallet.totalWithdrawals += transaction.amount;
    }

    // Update transaction
    transaction.status = 'completed';
    transaction.adminNotes = adminNotes || '';
    transaction.processedAt = new Date();
    transaction.processedBy = req.admin._id;

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      message: `${transaction.type} approved successfully`,
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        user: {
          username: user.username,
          newBalance: user.wallet.balance
        }
      }
    });
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Reject Transaction
router.post('/wallet/admin/reject/:id', adminAuth, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const transactionId = req.params.id;

    const transaction = await Transaction.findById(transactionId).populate('user');
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.status !== 'admin_pending') {
      return res.status(400).json({ message: 'Transaction cannot be rejected' });
    }

    // Update transaction
    transaction.status = 'cancelled';
    transaction.adminNotes = adminNotes || 'Rejected by admin';
    transaction.processedAt = new Date();
    transaction.processedBy = req.admin._id;

    await transaction.save();

    res.json({
      message: `${transaction.type} rejected successfully`,
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        adminNotes: transaction.adminNotes
      }
    });
  } catch (error) {
    console.error('Error rejecting transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get all withdrawal transactions (for Admin)
router.get('/wallet/admin/withdrawals', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, userId } = req.query;

    // Filter for only withdrawal type
    const filter = { type: 'withdrawal' };
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const withdrawals = await Transaction.find(filter)
      .populate('user', 'username email')
      .populate('processedBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      message: 'Withdrawal transactions retrieved successfully',
      withdrawals,
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
