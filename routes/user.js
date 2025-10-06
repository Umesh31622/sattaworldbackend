const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Game = require('../models/Game');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const Result = require('../models/Result');
const HardGame = require('../models/HardGame');
const GameRate = require('../models/GameRate');
const GameWin = require("../models/GameWin")
const Settings = require('../models/Settings');
const Admin = require('../models/Admin');
const upload= require("../utils/upload")
const cloudinary = require("../utils/cloudinary")
const mongoose = require('mongoose');
const Notice = require("../models/Notice")
const moment = require('moment-timezone');
const AdminSetting = require('../models/AdminSetting');
const streamifier = require('streamifier');
const  ASettings = require("../models/AdminSetting")
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
// Update User Details API (with profile image upload)
router.put('/update',  authMiddleware,upload.single('profileImage'), async (req, res) => {
  try {
    const userId =req.user._id
    const {
      username,
      email,
      mobile,
      password,
      paymentDetails
    } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
 // ✅ Check if new username already exists (and not same user)
 if (username && username !== user.username) {
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ message: 'Username already taken' });
  }
  user.username = username;
}
    // ✅ Upload profile image to Cloudinary if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      user.profileImage = result.secure_url; // Save Cloudinary URL
    }

    // ✅ Update other fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (mobile) user.mobile = mobile;

    if (paymentDetails) {
      user.paymentDetails = {
        ...user.paymentDetails,
        ...paymentDetails
      };
    }

    // ✅ If password is provided, hash it
    if (password && password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();

    res.status(200).json({ message: 'User details updated successfully', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error while updating user' });
  }
});
// Get Home Dashboard Data
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's results
    const todayResults = await Result.find({
      date: { $gte: today }
    }).populate('gameId').sort({ declaredAt: -1 }).limit(5);

    // Get user's recent bets
    const recentBets = await Bet.find({ user: req.user._id })
      .populate('game')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get user's today's activities
    const todayTransactions = await Transaction.find({
      user: req.user._id,
      createdAt: { $gte: today }
    }).sort({ createdAt: -1 });

    // Get active games
    const activeGames = await Game.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(10);

    // Calculate statistics
    const totalBets = await Bet.countDocuments({ user: req.user._id });
    const totalWins = await Bet.countDocuments({ 
      user: req.user._id, 
      status: 'won' 
    });

    res.json({
      message: 'Dashboard data retrieved successfully',
      data: {
        user: {
          name: req.user.username,
          balance: req.user.wallet.balance,
          totalWinnings: req.user.wallet.totalWinnings,
          referralCode: req.user.referralCode
        },
        todayResults,
        recentBets,
        todayTransactions,
        activeGames,
        statistics: {
          totalBets,
          totalWins,
          winPercentage: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// // Get Today's Lucky Number
// router.get('/testing-today-number', authMiddleware, async (req, res) => {
//   try {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const todayResult = await Result.findOne({
//       date: { $gte: today }
//     }).populate('gameId').sort({ declaredAt: -1 });

//     if (!todayResult) {
//       return res.json({
//         message: 'No result declared for today yet',
//         luckyNumber: null,
//         nextResultTime: null
//       });
//     }

//     res.json({
//       message: 'Today\'s lucky number retrieved',
//       luckyNumber: todayResult.openResult || todayResult.closeResult,
//       game: todayResult.gameId.name,
//       declaredAt: todayResult.declaredAt
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.get('/today-number', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayResult = await Result.findOne({
      date: { $gte: today },
      status: 'published' // optional filter if you want only published ones
    }).populate('gameId').sort({ declaredAt: -1 });

    if (!todayResult) {
      return res.json({
        message: 'No result declared for today yet',
        luckyNumber: null,
        nextResultTime: null
      });
    }

    const resultTime = todayResult.scheduledPublishTime || todayResult.gameId?.resultDateTime;

    if (!resultTime || now < resultTime) {
      return res.json({
        message: 'Result not declared yet',
        luckyNumber: null,
        game: todayResult.gameId?.name,
        resultWillBeDeclaredAt: resultTime
      });
    }

    res.json({
      message: 'Today\'s lucky number retrieved',
      luckyNumber: todayResult.openResult || todayResult.closeResult,
      game: todayResult.gameId.name,
      declaredAt: todayResult.declaredAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Today's Lucky Number
router.get('/timings-today-number', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Find the most recent result declared today
    const todayResult = await Result.findOne({
      date: { $gte: startOfDay }
    })
      .populate('gameId')
      .sort({ declaredAt: -1 });

    if (!todayResult) {
      // No result yet: find the next upcoming game's result time
      const nextGame = await Game.findOne({
        resultDateTime: { $gte: now },
        status: 'active'
      }).sort({ resultDateTime: 1 });

      return res.json({
        message: 'No result declared for today yet',
        luckyNumber: null,
        nextResultTime: nextGame ? nextGame.resultDateTime : null,
        nextGame: nextGame ? nextGame.name : null
      });
    }

    // Ensure the result is not shown before the game's resultDateTime
    const resultTime = todayResult.gameId.resultDateTime;

    if (now < resultTime) {
      return res.json({
        message: 'Result not declared yet',
        luckyNumber: null,
        resultWillBeDeclaredAt: resultTime,
        game: todayResult.gameId.name
      });
    }

    // Result is available
    res.json({
      message: 'Today\'s lucky number retrieved',
      luckyNumber: todayResult.openResult || todayResult.closeResult,
      game: todayResult.gameId.name,
      declaredAt: todayResult.declaredAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// router.get('/timings-today-number', authMiddleware, async (req, res) => {
//   try {
//     const now = new Date();
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     // Find the most recent result declared today
//     const todayResult = await Result.findOne({
//       date: { $gte: startOfDay }
//     })
//       .populate('gameId')
//       .sort({ declaredAt: -1 });

//     if (!todayResult) {
//       // No result yet: find the next upcoming game's result time
//       const nextGame = await Game.findOne({
//         resultDateTime: { $gte: now },
//         status: 'active'
//       }).sort({ resultDateTime: 1 }); // Nearest upcoming game

//       return res.json({
//         message: 'No result declared for today yet',
//         luckyNumber: null,
//         nextResultTime: nextGame ? nextGame.resultDateTime : null,
//         nextGame: nextGame ? nextGame.name : null
//       });
//     }

//     // Result is available
//     res.json({
//       message: 'Today\'s lucky number retrieved',
//       luckyNumber: todayResult.openResult || todayResult.closeResult,
//       game: todayResult.gameId.name,
//       declaredAt: todayResult.declaredAt
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.get('/games', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // ✅ Step 1: Get all active games whose results have not been declared
    const activeGames = await Game.find({ 
      status: 'active',
      result: { $exists: false } // or resultDeclared: false
    }).sort({ createdAt: -1 });

    const enrichedGames = await Promise.all(
      activeGames.map(async (game) => {
        const now = new Date();
        const isOpen = now >= game.openDateTime && now <= game.closeDateTime;
        const gameStatus = isOpen ? 'open' : 'closed';

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const totalParticipants = await Bet.countDocuments({
          game: game._id,
          betDate: { $gte: startOfDay }
        });

        return {
          ...game.toObject(),
          gameStatus,
          totalParticipants
        };
      })
    );

    res.json({
      message: 'Games retrieved successfully',
      games: enrichedGames
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Game Details
router.get('/games/:gameId', authMiddleware, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Get game rates
    const gameRates = await GameRate.find({ 
      gameId: req.params.gameId,
      isActive: true 
    });

    // Get recent results
    const recentResults = await Result.find({ gameId: req.params.gameId })
      .sort({ declaredAt: -1 })
      .limit(10);

    res.json({
      message: 'Game details retrieved successfully',
      game,
      rates: gameRates,
      recentResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Place Bet on Number Game
// Updated Betting Route
router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { betNumber, betAmount, date } = req.body;

    // ✅ Validate inputs
    if (typeof betNumber !== 'number' || typeof betAmount !== 'number' || betAmount <= 0) {
      return res.status(400).json({ message: "Invalid betNumber or betAmount" });
    }
    if (!date) {
      return res.status(400).json({ message: "Bet date is required" });
    }

    // 🕑 Convert user's date to IST
    const userBetDateUTC = new Date(date);
    if (isNaN(userBetDateUTC.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    const userBetDateIST = moment(userBetDateUTC).tz("Asia/Kolkata");

    // ✅ Fetch game
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    const openTimeIST = moment(game.openDateTime).tz("Asia/Kolkata");
    const closeTimeIST = moment(game.closeDateTime).tz("Asia/Kolkata");

    // ✅ Check bet timing
    if (userBetDateIST.isBefore(openTimeIST)) {
      return res.status(400).json({
        message: "Betting has not opened yet for this game",
        gameOpenTime: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
        userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
      });
    }
    if (userBetDateIST.isAfter(closeTimeIST)) {
      return res.status(400).json({
        message: "Betting has already closed for this game",
        gameCloseTime: closeTimeIST.format("YYYY-MM-DD HH:mm:ss"),
        userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
      });
    }

    // ✅ Fetch user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Check wallet balance
    if (user.wallet.balance < betAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    // ✅ Deduct wallet balance
    user.wallet.balance -= betAmount;
  // ✅ Atomically update admin's bidAmount
await Admin.findOneAndUpdate(
  { role: 'admin' },
  { $inc: { bidAmount: betAmount } }
);
    await user.save();

    // ✅ Check if user already has a bet for this game
    let bet = await Bet.findOne({ user: user._id, game: game._id });
    
    if (bet) {
      // 🟢 User has existing bets for this game
      const existingBetIndex = bet.betNumbers.findIndex(b => b.number === betNumber);
      
      if (existingBetIndex !== -1) {
        // 📈 Same number - add to existing amount
        bet.betNumbers[existingBetIndex].amount += betAmount;
      } else {
        // 🆕 New number - add to betNumbers array
        bet.betNumbers.push({
          number: betNumber,
          amount: betAmount
        });
      }
      
      await bet.save();
    } else {
      // 🆕 Create new bet with first number
      bet = new Bet({
        user: user._id,
        game: game._id,
        betNumbers: [{
          number: betNumber,
          amount: betAmount
        }],
        gameType: 'regular',
        betDate: userBetDateUTC
      });
      await bet.save();
    }

    return res.status(200).json({
      success: true,
      message: "Bet placed successfully",
      betDetails: {
        betId: bet.betId,
        betNumbers: bet.betNumbers,
        totalBetAmount: bet.totalBetAmount
      },
      walletBalance: user.wallet.balance,
      userBetTimeIST: userBetDateIST.format("YYYY-MM-DD HH:mm:ss"),
      gameOpenTimeIST: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
      gameCloseTimeIST: closeTimeIST.format("YYYY-MM-DD HH:mm:ss")
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Get User's Bet History for a Game
router.get('/games/:gameId/my-bets', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const bet = await Bet.findOne({ 
      user: req.user._id, 
      game: gameId 
    }).populate('game', 'name status currentResult');
    
    if (!bet) {
      return res.status(404).json({ message: "No bets found for this game" });
    }
    
    return res.status(200).json({
      success: true,
      bet: {
        betId: bet.betId,
        betNumbers: bet.betNumbers,
        totalBetAmount: bet.totalBetAmount,
        status: bet.status,
        winningAmount: bet.winningAmount,
        winningNumbers: bet.winningNumbers,
        game: bet.game
      }
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
//   try {
//     const { gameId } = req.params;
//     const { betNumber, betAmount, date } = req.body;

//     // ✅ Validate inputs
//     if (typeof betNumber !== 'number' || typeof betAmount !== 'number' || betAmount <= 0) {
//       return res.status(400).json({ message: "Invalid betNumber or betAmount" });
//     }
//     if (!date) {
//       return res.status(400).json({ message: "Bet date is required" });
//     }

//     // 🕑 Convert user's date to IST
//     const userBetDateUTC = new Date(date);
//     if (isNaN(userBetDateUTC.getTime())) {
//       return res.status(400).json({ message: "Invalid date format" });
//     }
//     const userBetDateIST = moment(userBetDateUTC).tz("Asia/Kolkata");

//     // ✅ Fetch game
//     const game = await Game.findById(gameId);
//     if (!game) {
//       return res.status(404).json({ message: "Game not found" });
//     }

//     const openTimeIST = moment(game.openDateTime).tz("Asia/Kolkata");
//     const closeTimeIST = moment(game.closeDateTime).tz("Asia/Kolkata");

//     // ✅ Check bet timing
//     if (userBetDateIST.isBefore(openTimeIST)) {
//       return res.status(400).json({
//         message: "Betting has not opened yet for this game",
//         gameOpenTime: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//         userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
//       });
//     }
//     if (userBetDateIST.isAfter(closeTimeIST)) {
//       return res.status(400).json({
//         message: "Betting has already closed for this game",
//         gameCloseTime: closeTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//         userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
//       });
//     }

//     // ✅ Fetch user
//     const user = await User.findById(req.user._id);
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // ✅ Check wallet balance
//     if (user.wallet.balance < betAmount) {
//       return res.status(400).json({ message: "Insufficient wallet balance" });
//     }

//     // ✅ Deduct wallet balance
//     user.wallet.balance -= betAmount;
//     await user.save();

//     // ✅ Check if user already has a bet for this game
//     let bet = await Bet.findOne({ user: user._id, game: game._id });
//     if (bet) {
//       // 🟢 Check if betNumber is different
//       if (bet.betNumber !== betNumber) {
//         // Save previous number to history
//         if (!bet.betNumbersHistory.includes(bet.betNumber)) {
//           bet.betNumbersHistory.push(bet.betNumber);
//         }
//         // Update betNumber
//         bet.betNumber = betNumber;
//       }
//       // Increment betAmount
//       bet.betAmount += betAmount;
//       await bet.save();
//     } else {
//       // 🆕 Create new bet
//       bet = new Bet({
//         user: user._id,
//         game: game._id,
//         betNumber,
//         betAmount,
//         gameType: 'regular', // Default for now
//         betDate: userBetDateUTC
//       });
//       await bet.save();
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Bet placed successfully",
//       bet,
//       walletBalance: user.wallet.balance,
//       userBetTimeIST: userBetDateIST.format("YYYY-MM-DD HH:mm:ss"),
//       gameOpenTimeIST: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//       gameCloseTimeIST: closeTimeIST.format("YYYY-MM-DD HH:mm:ss")
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });
// ==============================================
// Get Hard Game Status
router.get('/hard-game/status', authMiddleware, async (req, res) => {
  try {
    const settings = await Settings.findOne({});
    const multiplier = settings?.hardGameMultiplier || 9;

    // Get last 5 results
    const lastResults = await HardGame.find({
      status: { $ne: 'pending' }
    }).sort({ createdAt: -1 }).limit(5);

    // Get next result time (can be dynamic based on admin settings)
    const nextResultTime = new Date();
    nextResultTime.setMinutes(nextResultTime.getMinutes() + 5); // Next result in 5 minutes

    res.json({
      message: 'Hard game status retrieved',
      multiplier,
      lastResults: lastResults.map(r => ({
        number: r.resultNumber,
        time: r.createdAt
      })),
      nextResultTime
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/testing-hardgame',  async (req, res) => {
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
// User plays the Hard Game
router.post('/user/play-hardgames', authMiddleware, async (req, res) => {
  try {
    const { gameId, selectedNumber, betAmount } = req.body;

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'Invalid game ID' });
    }
    if (selectedNumber < 0 || selectedNumber > 9) {
      return res.status(400).json({ message: 'Selected number must be between 0 and 9' });
    }
    if (betAmount <= 0) {
      return res.status(400).json({ message: 'Bet amount must be greater than 0' });
    }

    // Find the hard game by ID
    const hardGame = await HardGame.findById(gameId);
    if (!hardGame) {
      return res.status(404).json({ message: 'Hard game not found with this ID' });
    }

    // Fetch user wallet
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check wallet balance
    if (user.walletBalance < betAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Deduct wallet
    user.walletBalance -= betAmount;
    System

    // Prepare the bet
    let status = 'pending';
    let winningAmount = 0;

    // ✅ Check if result already declared
    if (hardGame.resultNumber !== undefined && hardGame.resultNumber !== null) {
      if (selectedNumber === hardGame.resultNumber) {
        // User won
        status = 'won';
        winningAmount = betAmount * 9; // Example payout multiplier
        user.walletBalance += winningAmount; // Credit winnings
      } else {
        // User lost
        status = 'lost';
      }
    }

    // Save updated user wallet
    await user.save();

    // Save the user's bet
    const userBet = new HardGame({
      user: req.user._id,
      betAmount,
      selectedNumber,
      resultNumber: hardGame.resultNumber, // save declared result (if exists)
      winningAmount,
      nextResultTime: hardGame.nextResultTime,
      status
    });
    await userBet.save();

    res.status(201).json({
      message: `Your bet has been placed successfully and is currently "${status}".`,
      walletBalance: user.walletBalance,
      userBet
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Hard Game history for the logged-in user
router.get('/testing-hardgame/history', authMiddleware, async (req, res) => {
  try {
    // Fetch all HardGame bets for the logged-in user
    const userHistory = await HardGame.find({ user: req.user._id })
      .sort({ createdAt: -1 }); // Latest first

    res.status(200).json({
      message: 'Hard Game history fetched successfully',
      totalBets: userHistory.length,
      history: userHistory
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Live Results
// router.get('/results/live', authMiddleware, async (req, res) => {
//   try {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const liveResults = await Result.find({
//       date: { $gte: today }
//     }).populate('gameId').sort({ declaredAt: -1 });

//     res.json({
//       message: 'Live results retrieved successfully',
//       results: liveResults
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.get('/results/live', authMiddleware, async (req, res) => {
  try {
    const now = new Date();

    const liveResults = await Result.find({
      date: { $lte: now },       // Scheduled time has passed
      expiresAt: { $gt: now },   // Not expired yet
      status: 'published'
    })
    .populate('gameId')
    .sort({ declaredAt: -1 });
    res.json({
      message: 'Live results retrieved successfully',
      results: liveResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Last 5 Results
router.get('/results/last-five', authMiddleware, async (req, res) => {
  try {
    const lastResults = await Result.find({})
      .populate('gameId')
      .sort({ declaredAt: -1 })
      .limit(5);

    res.json({
      message: 'Last 5 results retrieved successfully',
      results: lastResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get History of Hard Game Results
router.get('/results/hard-history', authMiddleware, async (req, res) => {
  try {
    const hardGameResults = await Result.find({})
      .populate({
        path: 'gameId',
        match: { gameType: 'hard' } // Only games with gameType 'hard'
      })
      .sort({ declaredAt: -1 }); // Most recent first

    // Remove results where gameId is null (filtered out in populate)
    const filteredResults = hardGameResults.filter(result => result.gameId !== null);

    res.json({
      message: 'Hard game results history retrieved successfully',
      results: filteredResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Result History
router.get('/results/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, gameId } = req.query;

    const filter = {};
    if (gameId) {
      filter.gameId = gameId;
    }

    const results = await Result.find(filter)
      .populate('gameId')
      .sort({ declaredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Result.countDocuments(filter);

    res.json({
      message: 'Result history retrieved successfully',
      results,
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
// Get User Profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    // Get user statistics
    const totalBets = await Bet.countDocuments({ user: req.user._id });
    const totalWins = await Bet.countDocuments({ 
      user: req.user._id, 
      status: 'won' 
    });
    const totalHardGames = await HardGame.countDocuments({ user: req.user._id });

    res.json({
      message: 'Profile retrieved successfully',
      user,
      statistics: {
        totalBets,
        totalWins,
        totalHardGames,
        winPercentage: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Update Profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, mobile, paymentDetails } = req.body;

    const updateData = {};
    if (username) updateData.username = username;
    if (mobile) updateData.mobile = mobile;
    if (paymentDetails) updateData.paymentDetails = paymentDetails;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Referral Details
router.get('/referral', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Get referred users
    const referredUsers = await User.find({ 
      referredBy: req.user._id 
    }).select('username email mobile createdAt');

    // Get referral transactions
    const referralTransactions = await Transaction.find({
      user: req.user._id,
      type: 'referral'
    }).sort({ createdAt: -1 });

    res.json({
      message: 'Referral details retrieved successfully',
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings,
      referredUsers,
      referralTransactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get App Settings
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await Settings.findOne({});
    
    res.json({
      message: 'Settings retrieved successfully',
      settings: {
        withdrawalTimings: settings?.withdrawalTimings,
        minimumDeposit: settings?.minimumDeposit || 100,
        minimumWithdrawal: settings?.minimumWithdrawal || 500,
        referralCommission: settings?.referralCommission || 5
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// winning for the users check
// 🪙 GET /api/user/wallet
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id; // ✅ Get logged-in user ID from auth middleware

    // Find the user by ID
    const user = await User.findById(userId).select('wallet'); // only get wallet field
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Wallet retrieved successfully',
      wallet: user.wallet
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// POST /wallet/withdraw
router.post('/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { 
      amount, 
      paymentMethod, 
      accountNumber, 
      ifscCode, 
      accountHolderName, 
      upiId, 
      mobileNumber 
    } = req.body;

    // ✅ Validate required fields
    if (!amount || !paymentMethod || (!accountNumber && !upiId)) {
      return res.status(400).json({ message: 'All payment details are required' });
    }

    const settings = await Settings.findOne({});
    const minWithdrawal = settings?.minimumWithdrawal || 500;

    // ✅ Minimum amount check
    if (amount < minWithdrawal) {
      return res.status(400).json({
        message: `Minimum withdrawal amount is ${minWithdrawal}`
      });
    }

    // ✅ Check user balance
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // ✅ Create withdrawal transaction
    const transaction = new Transaction({
      user: req.user._id,
      type: 'withdrawal',
      amount,
      paymentMethod,
      paymentDetails: {
        accountNumber,
        ifscCode,
        accountHolderName,
        upiId,
        mobileNumber
      },
      description: `Withdrawal via ${paymentMethod}`,
      status: 'admin_pending' // 🟡 waiting for admin approval
    });

    await transaction.save();

    res.status(200).json({
      message: 'Withdrawal request sent to admin for approval',
      transaction: {
        id: transaction._id,
        amount,
        status: transaction.status,
        paymentMethod,
        paymentDetails: transaction.paymentDetails
      }
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /api/games/declared
// router.get('/games-test/declared', async (req, res) => {
//   try {
//     // Find all results where declaredAt exists (results declared)
//     const declaredResults = await Result.find({ declaredAt: { $ne: null } })
//       .populate('gameId', 'name openTime closeTime resultTime currentResult') // populate game details
//       .sort({ declaredAt: -1 }); // latest first

//     // Map through results to add winners count
//     const gamesWithWinners = await Promise.all(
//       declaredResults.map(async (result) => {
//         // Count winners for this gameId and result
//         const winnerCount = await GameWin.countDocuments({
//           gameId: result.gameId._id,
//           resultId: result._id
//         });

//         return {
//           gameName: result.gameId.name,
//           luckyNumber: result.openResult || result.closeResult || result.spinnerResult,
//           openTime: result.gameId.openTime,
//           closeTime: result.gameId.closeTime,
//           resultTime: result.gameId.resultTime,
//           declaredAt: result.declaredAt,
//           totalWinners: winnerCount
//         };
//       })
//     );

//     res.status(200).json({
//       success: true,
//       count: gamesWithWinners.length,
//       data: gamesWithWinners
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch declared games',
//       error: error.message
//     });
//   }
// });
router.get('/games-test/declared', async (req, res) => {
  try {
    const declaredResults = await Result.find({ declaredAt: { $ne: null } })
      .populate('gameId', 'name openTime closeTime resultTime currentResult') // only necessary fields
      .sort({ declaredAt: -1 });

    const gamesWithWinners = await Promise.all(
      declaredResults.map(async (result) => {
        // If gameId is null (broken reference), skip this result
        if (!result.gameId) return null;

        const winnerCount = await GameWin.countDocuments({
          gameId: result.gameId._id,
          resultId: result._id
        });

        return {
          gameName: result.gameId.name,
          luckyNumber: result.openResult || result.closeResult || result.spinnerResult,
          openTime: result.gameId.openTime,
          closeTime: result.gameId.closeTime,
          resultTime: result.gameId.resultTime,
          declaredAt: result.declaredAt,
          totalWinners: winnerCount
        };
      })
    );

    // Filter out null entries (where gameId was missing)
    const filteredGames = gamesWithWinners.filter((g) => g !== null);

    res.status(200).json({
      success: true,
      count: filteredGames.length,
      data: filteredGames
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch declared games',
      error: error.message
    });
  }
});
// ✅ GET /api/games/user-regular
router.get('/user-gaming-history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 📝 Step 1: Find all user bets in "regular" games
    const userBets = await Bet.find({
      user: userId,
      gameType: 'regular'
    }).populate('game').lean();

    if (userBets.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'User has not placed bets in any regular games.',
        games: []
      });
    }

    // 📝 Step 2: Group bets by game and sum total invested money
    const gameInvestments = {};
    userBets.forEach(bet => {
      const gameId = bet.game._id.toString();
      if (!gameInvestments[gameId]) {
        gameInvestments[gameId] = {
          gameDetails: bet.game,
          totalInvested: 0
        };
      }
      gameInvestments[gameId].totalInvested += bet.totalBetAmount;
    });

    // 📝 Step 3: Format response
    const gamesWithInvestments = Object.values(gameInvestments).map(item => ({
      _id: item.gameDetails._id,
      name: item.gameDetails.name,
      openTime: item.gameDetails.openTime,
      closeTime: item.gameDetails.closeTime,
      resultTime: item.gameDetails.resultTime,
      status: item.gameDetails.status,
      gameType: item.gameDetails.gameType,
      rates: item.gameDetails.rates,
      totalInvested: item.totalInvested // ✅ user’s total money invested
    }));

    res.status(200).json({
      success: true,
      games: gamesWithInvestments
    });
  } catch (error) {
    console.error('Error fetching user regular games:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});
// ✅ GET /api/games/user-wins
router.get('/user-wins', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 📝 Step 1: Find all bets where user has won
    const winningBets = await Bet.find({
      user: userId,
      status: 'won' // or use isWinner: true
    }).populate('game').lean();

    if (winningBets.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'User has not won in any games yet.',
        games: []
      });
    }

    // 📝 Step 2: Group by game and include bet info
    const wonGames = winningBets.map(bet => ({
      gameId: bet.game._id,
      name: bet.game.name,
      openTime: bet.game.openTime,
      closeTime: bet.game.closeTime,
      resultTime: bet.game.resultTime,
      gameType: bet.game.gameType,
      rates: bet.game.rates,
      betDetails: {
        betId: bet.betId,
        session: bet.session,
        betNumber: bet.betNumber,
        betAmount: bet.betAmount,
        betType: bet.betType,
        winningAmount: bet.winningAmount,
        resultNumber: bet.resultNumber,
        wonAt: bet.updatedAt
      }
    }));

    res.status(200).json({
      success: true,
      games: wonGames
    });
  } catch (error) {
    console.error('Error fetching user won games:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});
//hardgames users history
router.get('/hardgame/user/historys', authMiddleware, async (req, res) => {
  try {
    // ✅ Get the user ID from the token
    const userId = req.user._id;

    // ✅ Fetch the user's hard game history
    const userResults = await HardGame.find({ user: userId })
      .populate('user', 'username email profileImage') // Fetch user details
      .sort({ createdAt: -1 }); // Latest first

    if (!userResults || userResults.length === 0) {
      return res.status(404).json({ message: 'No hard game results found for this user.' });
    }

    res.status(200).json({
      message: 'Hard Game results fetched successfully',
      totalResults: userResults.length,
      results: userResults
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// ✅ Get all notices (latest first)
router.get('/notices', async (req, res) => {
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
// API to get all bets for a particular user
router.get('/user-bets/:userId', authMiddleware, async (req, res) => {
  try {
      const { userId } = req.params;
      const { status, gameId, limit = 10, page = 1 } = req.query;
      
      // Build query
      let query = { user: userId };
      if (status) query.status = status;
      if (gameId) query.game = gameId;
      
      const skip = (page - 1) * limit;
      
      // Get user bets with game details
      const bets = await Bet.find(query)
          .populate('game', 'name openDateTime closeDateTime resultDateTime status')
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .skip(skip);
      
      const totalBets = await Bet.countDocuments(query);
      
      res.json({
          success: true,
          data: {
              bets,
              pagination: {
                  currentPage: parseInt(page),
                  totalPages: Math.ceil(totalBets / limit),
                  totalBets,
                  hasNext: page * limit < totalBets,
                  hasPrev: page > 1
              }
          }
      });
  } catch (error) {
      console.error('Error fetching user bets:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// API to get bets by game for a user
router.get('/user-bets/game/:gameId', authMiddleware, async (req, res) => {
  try {
      const { gameId } = req.params;
      const userId = req.user._id; // ✅ Get userId from token

      
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
// router.post('/check-results', authMiddleware, async (req, res) => {
//   try {
//     const { gameId, userId } = req.body;

//     if (!gameId || !userId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Game ID and User ID are required'
//       });
//     }

//     const game = await Game.findById(gameId);
//     if (!game) {
//       return res.status(404).json({
//         success: false,
//         message: 'Game not found'
//       });
//     }

//     const result = await Result.findOne({
//       gameId: gameId,
//       isActive: true
//     }).sort({ declaredAt: -1 });

//     if (!result || (result.openResult === null && result.closeResult === null)) {
//       return res.status(400).json({
//         success: false,
//         message: 'No results declared for this game yet'
//       });
//     }

//     console.log(`✅ Game Result for ${game.gameName}:`);
//     console.log(`  - Open: ${result.openResult}`);
//     console.log(`  - Close: ${result.closeResult}`);
//     console.log(`  - Jodi: ${result.openResult}${result.closeResult}`);

//     const userBets = await Bet.find({
//       game: gameId,
//       user: userId,
//       status: 'pending'
//     }).populate('user', 'name email');

//     if (userBets.length === 0) {
//       return res.json({
//         success: true,
//         message: 'No pending bets found for this user in this game',
//         data: {
//           userBets: [],
//           totalWinnings: 0,
//           gameResult: {
//             openResult: result.openResult,
//             closeResult: result.closeResult
//           }
//         }
//       });
//     }

//     let totalUserWinnings = 0;
//     const userBetResults = [];

//     for (const bet of userBets) {
//       let totalWinningAmount = 0;
//       let winningNumbers = [];
//       let hasWon = false;

//       console.log(`🔍 Checking Bet ID: ${bet.betId}`);
//       console.log(`  - Bet Type: ${bet.betType}`);
//       console.log(`  - Bet Numbers:`, bet.betNumbers);

//       for (const betNumber of bet.betNumbers) {
//         const number = Number(betNumber.number);
//         const amount = betNumber.amount;

//         const openMatch = result.openResult !== null && number === result.openResult;
//         const closeMatch = result.closeResult !== null && number === result.closeResult;
//         const jodiMatch = result.openResult !== null && result.closeResult !== null &&
//                           number === parseInt(`${result.openResult}${result.closeResult}`);

//         let numberWon = false;
//         let winAmount = 0;
//         let multiplierUsed = 0;

//         console.log(`  ➤ Checking Number: ${number}`);
//         console.log(`     - Open Match: ${openMatch}`);
//         console.log(`     - Close Match: ${closeMatch}`);
//         console.log(`     - Jodi Match: ${jodiMatch}`);

//         if (openMatch || closeMatch) {
//           numberWon = true;
//           winAmount += amount * game.rates.singleDigit;
//           multiplierUsed = game.rates.singleDigit;
//         }

//         if (jodiMatch) {
//           numberWon = true;
//           winAmount += amount * game.rates.jodiDigit;
//           multiplierUsed = game.rates.jodiDigit;
//         }

//         if (numberWon) {
//           hasWon = true;
//           totalWinningAmount += winAmount;
//           console.log(`     ✅ WIN! Amount: ₹${winAmount} using multiplier: ${multiplierUsed}`);

//           winningNumbers.push({
//             number: betNumber.number,
//             betAmount: amount,
//             winAmount,
//             matched: {
//               open: openMatch,
//               close: closeMatch,
//               jodi: jodiMatch
//             },
//             multiplierUsed
//           });
//         } else {
//           console.log(`     ❌ No Match. Lost for number: ${number}`);
//         }
//       }

//       bet.status = hasWon ? 'won' : 'lost';
//       bet.winningAmount = totalWinningAmount;
//       bet.isWinner = hasWon;
//       bet.winningNumbers = winningNumbers;
//       bet.resultNumber = bet.betType === 'single'
//         ? (result.openResult !== null ? result.openResult : result.closeResult)
//         : (result.openResult !== null && result.closeResult !== null)
//           ? parseInt(`${result.openResult}${result.closeResult}`)
//           : null;

//       await bet.save();

//       if (hasWon && totalWinningAmount > 0) {
//         await User.findByIdAndUpdate(userId, {
//           $inc: {
//             'wallet.balance': totalWinningAmount,
//             'wallet.totalWinnings': totalWinningAmount
//           }
//         });

//         totalUserWinnings += totalWinningAmount;
//       }

//       userBetResults.push({
//         betId: bet.betId,
//         status: bet.status,
//         totalBetAmount: bet.totalBetAmount,
//         winningAmount: totalWinningAmount,
//         winningNumbers: winningNumbers,
//         isWinner: hasWon,
//         betNumbers: bet.betNumbers
//       });

//       console.log(`🎯 Final Bet Status: ${bet.status} | Winnings: ₹${totalWinningAmount}`);
//     }

//     res.json({
//       success: true,
//       message: `Results processed successfully for user's ${userBets.length} bets`,
//       data: {
//         userBets: userBetResults,
//         totalWinnings: totalUserWinnings,
//         gameResult: {
//           openResult: result.openResult,
//           closeResult: result.closeResult,
//           jodiResult: (result.openResult !== null && result.closeResult !== null)
//             ? parseInt(`${result.openResult}${result.closeResult}`)
//             : null
//         },
//         gameRates: {
//           singleDigit: game.rates.singleDigit,
//           jodiDigit: game.rates.jodiDigit
//         }
//       }
//     });

//   } catch (error) {
//     console.error('🚨 Error checking user game results:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });
router.post('/check-results', authMiddleware, async (req, res) => {
  try {
    const { gameId, userId } = req.body;

    if (!gameId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Game ID and User ID are required'
      });
    }

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    const result = await Result.findOne({
      gameId: gameId,
      isActive: true
    }).sort({ declaredAt: -1 });

    if (!result || (result.openResult === null && result.closeResult === null)) {
      return res.status(400).json({
        success: false,
        message: 'No results declared for this game yet'
      });
    }

    console.log(`✅ Game Result for ${game.gameName}:`);
    console.log(`  - Open: ${result.openResult}`);
    console.log(`  - Close: ${result.closeResult}`);
    console.log(`  - Jodi: ${result.openResult}${result.closeResult}`);

    const userBets = await Bet.find({
      game: gameId,
      user: userId,
      status: 'pending'
    }).populate('user', 'name email');

    // ✅ If no pending bets, check if user has already processed bets
    if (userBets.length === 0) {
      const previousBets = await Bet.find({
        game: gameId,
        user: userId,
        status: { $in: ['won', 'lost'] }
      });

      if (previousBets.length > 0) {
        return res.json({
          success: true,
          message: 'You have already checked the result. Here is your previous result.',
          data: {
            userBets: previousBets.map(bet => ({
              betId: bet.betId,
              status: bet.status,
              totalBetAmount: bet.totalBetAmount,
              winningAmount: bet.winningAmount,
              winningNumbers: bet.winningNumbers,
              isWinner: bet.isWinner,
              betNumbers: bet.betNumbers
            })),
            totalWinnings: previousBets.reduce((acc, bet) => acc + (bet.winningAmount || 0), 0),
            gameResult: {
              openResult: result.openResult,
              closeResult: result.closeResult,
              jodiResult: (result.openResult !== null && result.closeResult !== null)
                ? parseInt(`${result.openResult}${result.closeResult}`)
                : null
            },
            gameRates: {
              singleDigit: game.rates.singleDigit,
              jodiDigit: game.rates.jodiDigit
            }
          }
        });
      }

      // ✅ No bets at all (neither pending nor processed)
      return res.json({
        success: true,
        message: 'No bets found for this user in this game',
        data: {
          userBets: [],
          totalWinnings: 0,
          gameResult: {
            openResult: result.openResult,
            closeResult: result.closeResult
          }
        }
      });
    }

    let totalUserWinnings = 0;
    const userBetResults = [];

    for (const bet of userBets) {
      let totalWinningAmount = 0;
      let winningNumbers = [];
      let hasWon = false;

      console.log(`🔍 Checking Bet ID: ${bet.betId}`);
      console.log(`  - Bet Type: ${bet.betType}`);
      console.log(`  - Bet Numbers:`, bet.betNumbers);

      for (const betNumber of bet.betNumbers) {
        const number = Number(betNumber.number);
        const amount = betNumber.amount;

        const openMatch = result.openResult !== null && number === result.openResult;
        const closeMatch = result.closeResult !== null && number === result.closeResult;
        const jodiMatch = result.openResult !== null && result.closeResult !== null &&
                          number === parseInt(`${result.openResult}${result.closeResult}`);

        let numberWon = false;
        let winAmount = 0;
        let multiplierUsed = 0;

        console.log(`  ➤ Checking Number: ${number}`);
        console.log(`     - Open Match: ${openMatch}`);
        console.log(`     - Close Match: ${closeMatch}`);
        console.log(`     - Jodi Match: ${jodiMatch}`);

        if (openMatch || closeMatch) {
          numberWon = true;
          winAmount += amount * game.rates.singleDigit;
          multiplierUsed = game.rates.singleDigit;
        }

        // if (jodiMatch) {
        //   numberWon = true;
        //   winAmount += amount * game.rates.jodiDigit;
        //   multiplierUsed = game.rates.jodiDigit;
        // }

        if (numberWon) {
          hasWon = true;
          totalWinningAmount += winAmount;
          console.log(`     ✅ WIN! Amount: ₹${winAmount} using multiplier: ${multiplierUsed}`);

          winningNumbers.push({
            number: betNumber.number,
            betAmount: amount,
            winAmount,
            matched: {
              open: openMatch,
              close: closeMatch,
              jodi: jodiMatch
            },
            multiplierUsed
          });
        } else {
          console.log(`     ❌ No Match. Lost for number: ${number}`);
        }
      }

      bet.status = hasWon ? 'won' : 'lost';
      bet.winningAmount = totalWinningAmount;
      bet.isWinner = hasWon;
      bet.winningNumbers = winningNumbers;
      bet.resultNumber = bet.betType === 'single'
        ? (result.openResult !== null ? result.openResult : result.closeResult)
        : (result.openResult !== null && result.closeResult !== null)
          ? parseInt(`${result.openResult}${result.closeResult}`)
          : null;

      await bet.save();

      if (hasWon && totalWinningAmount > 0) {
        await User.findByIdAndUpdate(userId, {
          $inc: {
            'wallet.balance': totalWinningAmount,
            'wallet.totalWinnings': totalWinningAmount
          }
        });

        totalUserWinnings += totalWinningAmount;
      }

      userBetResults.push({
        betId: bet.betId,
        status: bet.status,
        totalBetAmount: bet.totalBetAmount,
        winningAmount: totalWinningAmount,
        winningNumbers: winningNumbers,
        isWinner: hasWon,
        betNumbers: bet.betNumbers
      });

      console.log(`🎯 Final Bet Status: ${bet.status} | Winnings: ₹${totalWinningAmount}`);
    }

    res.json({
      success: true,
      message: `Results processed successfully for user's ${userBets.length} bets`,
      data: {
        userBets: userBetResults,
        totalWinnings: totalUserWinnings,
        gameResult: {
          openResult: result.openResult,
          closeResult: result.closeResult,
          jodiResult: (result.openResult !== null && result.closeResult !== null)
            ? parseInt(`${result.openResult}${result.closeResult}`)
            : null
        },
        gameRates: {
          singleDigit: game.rates.singleDigit,
          jodiDigit: game.rates.jodiDigit
        }
      }
    });

  } catch (error) {
    console.error('🚨 Error checking user game results:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});
// Get user betting summary
router.get('/user-betting-summary/:userId', authMiddleware, async (req, res) => {
  try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Build date filter
      let dateFilter = {};
      if (startDate && endDate) {
          dateFilter = {
              betDate: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
              }
          };
      }
      
      // Get betting statistics
      const [summary] = await Bet.aggregate([
          {
              $match: { user: new mongoose.Types.ObjectId(userId), ...dateFilter }
          },
          {
              $group: {
                  _id: null,
                  totalBets: { $sum: 1 },
                  totalAmount: { $sum: '$totalBetAmount' },
                  totalWinnings: { $sum: '$winningAmount' },
                  wonBets: { $sum: { $cond: ['$isWinner', 1, 0] } },
                  lostBets: { $sum: { $cond: ['$isWinner', 0, 1] } },
                  pendingBets: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
              }
          }
      ]);
      
      // Get game-wise summary
      const gameWiseSummary = await Bet.aggregate([
          {
              $match: { user: new mongoose.Types.ObjectId(userId), ...dateFilter }
          },
          {
              $lookup: {
                  from: 'games',
                  localField: 'game',
                  foreignField: '_id',
                  as: 'gameDetails'
              }
          },
          {
              $group: {
                  _id: '$game',
                  gameName: { $first: { $arrayElemAt: ['$gameDetails.name', 0] } },
                  totalBets: { $sum: 1 },
                  totalAmount: { $sum: '$totalBetAmount' },
                  totalWinnings: { $sum: '$winningAmount' },
                  wonBets: { $sum: { $cond: ['$isWinner', 1, 0] } }
              }
          }
      ]);
      
      res.json({
          success: true,
          data: {
              overall: summary || {
                  totalBets: 0,
                  totalAmount: 0,
                  totalWinnings: 0,
                  wonBets: 0,
                  lostBets: 0,
                  pendingBets: 0
              },
              gameWise: gameWiseSummary
          }
      });
      
  } catch (error) {
      console.error('Error fetching betting summary:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// GET /transactions?type=deposit OR ?type=withdrawal
router.get('/transactions-based', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id; // ✅ get user ID from token
    const { type } = req.query;  // ✅ type can be: deposit, withdrawal, bet, win, etc.

    const filter = { user: userId };
    
    if (type) {
      filter.type = type;
    }

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Transactions fetched successfully',
      transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
router.get('/user-won-games', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id; // ✅ Get user ID from token

    // 🔍 Find all winning bets for this user
    const wonBets = await Bet.find({
      user: userId,
      isWinner: true
    })
    .populate('game', 'name openDateTime closeDateTime status result') // populate relevant game fields
    .sort({ createdAt: -1 });

    // 🧠 Extract unique games
    const uniqueGamesMap = {};
    const wonGames = [];

    for (const bet of wonBets) {
      const gameId = bet.game?._id?.toString();
      if (gameId && !uniqueGamesMap[gameId]) {
        uniqueGamesMap[gameId] = true;
        wonGames.push(bet.game);
      }
    }

    res.json({
      success: true,
      message: 'Won games retrieved successfully',
      games: wonGames
    });
  } catch (error) {
    console.error('Error fetching won games:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// Optional: Add a route to check potential referral bonus
router.get('/referral/bonus-preview/:referralCode', async (req, res) => {
  try {
    const { referralCode } = req.params;
    
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const potentialBonus = Math.floor(referrer.wallet.totalDeposits * 0.05);
    
    res.json({
      message: 'Referral bonus preview',
      referrerUsername: referrer.username || referrer.email,
      referrerTotalDeposits: referrer.wallet.totalDeposits,
      potentialBonus: potentialBonus,
      bonusPercentage: 5
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /api/users/referral-code
router.get('/referral-code',  authMiddleware, async (req, res) => {
  try {
    const referralCode = req.user.referralCode;
    res.json({ referralCode });
  } catch (err) {
    res.status(500).json({ message: 'Server error while fetching referral code' });
  }
});
// Get Wallet Details
router.get('/user-tests-wallet', authMiddleware, async (req, res) => {
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
//manual deposits 
router.post('/wallet/manual-deposit', authMiddleware, upload.single('paymentScreenshot'), async (req, res) => {
  try {
    const { amount, utrId, paymentMethod, remarks } = req.body;

    if (!amount || !utrId || !paymentMethod || !req.file) {
      return res.status(400).json({ 
        message: 'Amount, UTR ID, payment method and payment screenshot are required' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const settings = await AdminSetting.findOne({});
    const minDeposit = settings?.minimumDeposit || 100;

    if (amount < minDeposit) {
      return res.status(400).json({ 
        message: `Minimum deposit amount is ${minDeposit}` 
      });
    }

    // Check if UTR ID already exists
    const existingTransaction = await Transaction.findOne({
      'paymentDetails.transactionId': utrId,
      type: 'deposit'
    });

    if (existingTransaction) {
      return res.status(400).json({ 
        message: 'This UTR ID has already been used' 
      });
    }

    // Upload image to Cloudinary
    const cloudResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'manual_deposits' },
        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    const transaction = new Transaction({
      user: req.user._id,
      type: 'deposit',
      amount: parseFloat(amount),
      paymentMethod: paymentMethod,
      paymentDetails: {
        transactionId: utrId,
        remarks: remarks || ''
      },
      paymentScreenshot: {
        url: cloudResult.secure_url
      },
      description: `Manual deposit via ${paymentMethod}`,
      status: 'admin_pending'
    });
    

    await transaction.save();

    // // ✅ Push screenshot into user model
    // await User.findByIdAndUpdate(req.user._id, {
    //   $push: {
    //     depositScreenshots: {
    //       url: cloudResult.secure_url,
    //       transactionId: utrId
    //     }
    //   }
    // });

    res.json({
      message: 'Deposit request submitted successfully. Please wait for admin approval.',
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        status: transaction.status,
        utrId: utrId
      }
    });

  } catch (error) {
    console.error('Error creating manual deposit:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Manual Withdrawal Request
// router.post('/wallet/manual-withdraw', authMiddleware, upload.single('paymentScreenshot'), async (req, res) => {
//   try {
//     const { amount, paymentMethod, accountDetails, remarks } = req.body;

//     if (!amount || !paymentMethod || !accountDetails) {
//       return res.status(400).json({ message: 'Amount, payment method, account details, and payment screenshot are required' });
//     }

//     const account = JSON.parse(accountDetails);

//     const uploadedImage = await cloudinary.uploader.upload_stream({
//       resource_type: 'image',
//       folder: 'manual_withdrawals',
//     }, async (error, result) => {
//       if (error) {
//         return res.status(500).json({ message: 'Image upload failed', error });
//       }

//       const transaction = new Transaction({
//         user: req.user._id,
//         type: 'withdrawal',
//         amount,
//         status: 'admin_pending' ,// 🟡 waiting for admin approval

//         paymentMethod,
//         description: remarks || 'Manual withdrawal request',
//         paymentDetails: {
//           mobileNumber: account.mobileNumber,
//           accountNumber: account.accountNumber,
//           ifscCode: account.ifscCode,
//           accountHolderName: account.accountHolderName,
//           upiId: account.upiId,
//           transactionId: account.transactionId,
//           reference: account.reference
//         },
//         paymentScreenshot: {
//           url: result.secure_url
//         }
//       });

//       await transaction.save();
//       return res.status(200).json({ message: 'Withdrawal request submitted successfully', transaction });
//     });

//     uploadedImage.end(req.file.buffer);

//   } catch (err) {
//     console.error('Error:', err);
//     return res.status(500).json({ message: 'Server error', error: err.message });
//   }
// });
router.post('/wallet/manual-withdraw', authMiddleware, upload.single('paymentScreenshot'), async (req, res) => {
  try {
    const { amount, paymentMethod, accountDetails, remarks } = req.body;

    if (!amount || !paymentMethod || !accountDetails || !req.file) {
      return res.status(400).json({
        message: 'Amount, payment method, account details, and payment screenshot are required'
      });
    }

    const account = JSON.parse(accountDetails);

    // Wrap upload_stream in a Promise
    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          folder: 'manual_withdrawals',
        }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });

        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    const result = await uploadToCloudinary();

    const transaction = new Transaction({
      user: req.user._id,
      type: 'withdrawal',
      amount,
      status: 'admin_pending', // 🟡 waiting for admin approval
      paymentMethod,
      description: remarks || 'Manual withdrawal request',
      paymentDetails: {
        mobileNumber: account.mobileNumber,
        accountNumber: account.accountNumber,
        ifscCode: account.ifscCode,
        accountHolderName: account.accountHolderName,
        upiId: account.upiId,
        transactionId: account.transactionId,
        reference: account.reference
      },
      paymentScreenshot: {
        url: result.secure_url
      }
    });

    await transaction.save();

    return res.status(200).json({ message: 'Withdrawal request submitted successfully', transaction });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});
// Get Transaction History for User
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
//admin details
router.get('/Admin-details', async (req, res) => {
  try {
    let settings = await ASettings.findOne({});
    if (!settings) {
      settings = new ASettings({});
      await settings.save();
    }

    res.json({ message: 'Settings retrieved successfully', settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
module.exports = router;
