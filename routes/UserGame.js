
const express = require('express');
const router = express.Router();
const GameConfig = require('../models/GameConfig');
const SpinnerGame = require('../models/SpinnerGame');
const UserSpinHistory = require('../models/UserSpinHistory');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Admin = require("../models/Admin")
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'Apple');
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

// Get available games for users
router.get('/games', authMiddleware, async (req, res) => {
  try {
    const games = await GameConfig.find({ isActive: true });
    
    const formattedGames = games.map(game => ({
      id: game._id,
      name: game.gameName,
      description: game.description,
      minBet: game.minBet,
      maxBet: game.maxBet,
      multiplier: game.multiplier,
      resultInterval: game.resultInterval
    }));

    res.json({
      success: true,
      games: formattedGames
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/place-bet', authMiddleware, async (req, res) => {
  try {
    const { gameId, selectedNumber } = req.body;
    const betAmount = Number(req.body.betAmount); // ✅ ensure it's a number
    // Validation
    if (!gameId || isNaN(betAmount) || selectedNumber === undefined) {
      return res.status(400).json({ 
        error: 'Game ID, valid bet amount, and selected number are required' 
      });
    }
    if (selectedNumber < 0 || selectedNumber > 9) {
      return res.status(400).json({ 
        error: 'Selected number must be between 0-9' 
      });
    }
    // Get game configuration
    const gameConfig = await GameConfig.findById(gameId);
    if (!gameConfig || !gameConfig.isActive) {
      return res.status(404).json({ error: 'Game not found or inactive' });
    }

    // Validate bet amount
    if (betAmount < gameConfig.minBet || betAmount > gameConfig.maxBet) {
      return res.status(400).json({ 
        error: `Bet amount must be between ${gameConfig.minBet} and ${gameConfig.maxBet}` 
      });
    }

    // Check user balance
    const user = await User.findById(req.user.id);
    if (!user || typeof user.wallet.balance !== 'number') {
      return res.status(400).json({ error: 'User or wallet balance not found' });
    }

    if (user.wallet.balance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct bet amount
    user.wallet.balance -= betAmount;
    await user.save();
    await Admin.findOneAndUpdate(
      { role: 'admin' },
      { $inc: { bidAmount: betAmount } }
    );

    // Create game entry
    const spinnerGame = new SpinnerGame({
      gameConfigId: gameId,
      user: req.user.id,
      betAmount,
      selectedNumber,
      status: 'pending'
    });

    await spinnerGame.save();

    res.json({
      success: true,
      message: 'Bet placed successfully',
      gameId: spinnerGame._id,
      betAmount,
      selectedNumber,
      gameName: gameConfig.gameName,
      multiplier: gameConfig.multiplier
    });

  } catch (error) {
    console.error("💥 Place bet error:", error);
    res.status(500).json({ error: error.message });
  }
});
// // Start spinner
// router.post('/start-spin/:gameId', authMiddleware, async (req, res) => {
//   try {
//     const { gameId } = req.params;

//     const game = await SpinnerGame.findById(gameId)
//       .populate('gameConfigId')
//       .populate('user', 'username');

//     if (!game) {
//       return res.status(404).json({ error: 'Game not found' });
//     }

//     // ✅ User access check
//     if (game.user._id.toString() !== req.user.id) {
//       return res.status(403).json({ error: 'Unauthorized access' });
//     }

//     // ✅ Game status check
//     // if (game.status !== 'pending') {
//     //   return res.status(400).json({ error: 'Game already started or completed' });
//     // }

//     const gameConfig = game.gameConfigId;
//     console.log("gameconfigs: "+gameConfig);
//     const now = new Date();

//     // ✅ Time restriction check
//     if (gameConfig.lastResultTime) {
//       const nextAllowedTime = new Date(gameConfig.lastResultTime.getTime() + gameConfig.resultInterval * 60 * 1000);
//       if (now < nextAllowedTime) {
//         return res.status(400).json({
//           error: 'Spin not allowed yet. Please wait for the current round to end.',
//           timeRemaining: Math.ceil((nextAllowedTime - now) / 1000)
//         });
//       }
//     }

//     // ✅ Generate or assign resultNumber
//     let resultNumber;
//     if (gameConfig.resultMode === 'admin_controlled') {
//       const nextResult = gameConfig.nextResults.find(result => !result.isUsed);
//       if (nextResult) {
//         resultNumber = nextResult.resultNumber;
//         nextResult.isUsed = true;
//         nextResult.usedAt = new Date();
//         await gameConfig.save();
//       } else {
//         resultNumber = Math.floor(Math.random() * 10); // fallback
//       }
//     } else {
//       resultNumber = Math.floor(Math.random() * 10); // random mode
//     }

//     // ✅ Save result and update game
//     await updateUserSpinHistory(req.user.id, gameConfig._id, resultNumber, game._id);

//     game.status = 'spinning';
//     game.spinStartTime = now;
//     game.resultNumber = resultNumber;
//     await game.save();

//     res.json({
//       success: true,
//       message: 'Spinner started',
//       resultNumber,
//       gameId: game._id,
//       spinDuration: 3000,
//       resultInterval: gameConfig.resultInterval * 60 * 1000
//     });

//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });
router.post('/start-spin/:gameId', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await SpinnerGame.findById(gameId)
      .populate('gameConfigId')
      .populate('user', 'username');

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.user._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const gameConfig = game.gameConfigId;
    console.log("game id confis :"+gameConfig);
    const now = new Date();

    // ✅ Calculate the next allowed spin time
    if (gameConfig.lastResultTime) {
      const nextAllowedTime = new Date(
        gameConfig.lastResultTime.getTime() + gameConfig.resultInterval * 60 * 1000
      );

      if (now < nextAllowedTime) {
        const timeRemainingInSec = Math.ceil((nextAllowedTime - now) / 1000);
        return res.status(400).json({
          error: 'Spin not allowed yet. Please wait for the current round to end.',
          timeRemaining: timeRemainingInSec
        });
      }
    }

    // ✅ Generate or assign resultNumber
    let resultNumber;
    if (gameConfig.resultMode === 'admin_controlled') {
      const nextResult = gameConfig.nextResults.find(result => !result.isUsed);
      if (nextResult) {
        resultNumber = nextResult.resultNumber;
        nextResult.isUsed = true;
        nextResult.usedAt = new Date();
        await gameConfig.save();
      } else {
        resultNumber = Math.floor(Math.random() * 10); // fallback
      }
    } else {
      resultNumber = Math.floor(Math.random() * 10); // random mode
    }

    // ✅ Save spin result
    await updateUserSpinHistory(req.user.id, gameConfig._id, resultNumber, game._id);

    game.status = 'spinning';
    game.spinStartTime = now;
    game.resultNumber = resultNumber;
    await game.save();

    // ✅ Update gameConfig.lastResultTime
    gameConfig.lastResultTime = now;
    await gameConfig.save();

    return res.json({
      success: true,
      message: 'Spinner started',
      resultNumber,
      gameId: game._id,
      spinDuration: 3000,
      resultInterval: gameConfig.resultInterval * 60 * 1000
    });

  } catch (error) {
    console.error('Start Spin Error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Helper function to update user spin history
async function updateUserSpinHistory(userId, gameConfigId, number, gameId) {
  try {
    let userHistory = await UserSpinHistory.findOne({
      user: userId,
      gameConfigId: gameConfigId
    });

    if (!userHistory) {
      // Create new history record
      userHistory = new UserSpinHistory({
        user: userId,
        gameConfigId: gameConfigId,
        spinnerNumbers: [],
        totalSpins: 0
      });
    }

    // Add the new number
    userHistory.spinnerNumbers.push({
      number: number,
      timestamp: new Date(),
      gameId: gameId
    });

    userHistory.totalSpins += 1;
    userHistory.lastSpinAt = new Date();

    await userHistory.save();
  } catch (error) {
    console.error('Error updating user spin history:', error);
  }
}
// Stop spinner and get result
router.post('/stop-spin/:gameId', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await SpinnerGame.findById(gameId)
      .populate('gameConfigId')
      .populate('user', 'username');

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.user._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    if (game.status !== 'spinning') {
      return res.status(400).json({ error: 'Game is not in spinning state' });
    }

    // ⏱ Fetch user to check last spin time
    const user = await User.findById(req.user.id);

    const currentTime = new Date();
    const requiredWaitTime = game.gameConfigId.resultInterval * 60 * 1000; // ms
    const lastSpinTime = user.lastSpinAt;
    const isFirstSpin = !lastSpinTime;
    const timeSinceLastSpin = isFirstSpin ? Infinity : currentTime - new Date(lastSpinTime);

    if (!isFirstSpin && timeSinceLastSpin < requiredWaitTime) {
      return res.status(400).json({
        error: 'Please wait for the result interval to complete',
        timeRemaining: Math.ceil((requiredWaitTime - timeSinceLastSpin) / 1000)
      });
    }

    // ✅ Process the result
    const resultNumber = game.resultNumber;
    let winningAmount = 0;
    let gameResult = 'lost';

    if (resultNumber === game.selectedNumber) {
      winningAmount = game.betAmount * game.gameConfigId.multiplier;
      gameResult = 'won';

      user.wallet.balance += winningAmount;
      user.wallet.totalWinnings += winningAmount;
    }

    // Update game
    game.winningAmount = winningAmount;
    game.gameResult = gameResult;
    game.status = 'completed';
    game.spinEndTime = currentTime;
    game.resultGeneratedAt = currentTime;

    // 📝 Save updates
    user.lastSpinAt = currentTime;
    await Promise.all([user.save(), game.save()]);
    const gameConfig = await GameConfig.findById(game.gameConfigId);
    gameConfig.lastResultTime = new Date();
    await gameConfig.save();
    res.json({
      success: true,
      result: {
        gameId: game._id,
        selectedNumber: game.selectedNumber,
        resultNumber: resultNumber,
        betAmount: game.betAmount,
        winningAmount: winningAmount,
        gameResult: gameResult,
        multiplier: game.gameConfigId.multiplier,
        gameName: game.gameConfigId.gameName
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /api/next-result-times
router.get('/next-result-times', authMiddleware, async (req, res) => {
  try {
    const activeGames = await GameConfig.find({ isActive: true });

    const upcomingResults = activeGames.map(game => {
      const lastTime = game.lastResultTime || new Date();
      const nextResultTime = new Date(lastTime.getTime() + game.resultInterval * 60000); // resultInterval is in minutes

      return {
        gameName: game.gameName,
        nextResultTime,
        resultInterval: game.resultInterval,
        multiplier: game.multiplier,
        minBet: game.minBet,
        maxBet: game.maxBet,
        resultMode: game.resultMode
      };
    });

    res.json({ success: true, data: upcomingResults });
  } catch (error) {
    console.error('Error fetching next result times:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// Get game status
router.get('/status/:gameId', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await SpinnerGame.findById(gameId)
      .populate('gameConfigId', 'gameName resultInterval multiplier')
      .populate('user', 'username');

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.user._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let timeRemaining = 0;
    if (game.status === 'spinning' && game.spinStartTime) {
      const currentTime = new Date();
      const spinStartTime = new Date(game.spinStartTime);
      const requiredWaitTime = game.gameConfigId.resultInterval * 60 * 1000;
      const elapsedTime = currentTime - spinStartTime;
      timeRemaining = Math.max(0, Math.ceil((requiredWaitTime - elapsedTime) / 1000));
    }

    res.json({
      success: true,
      game: {
        id: game._id,
        status: game.status,
        gameResult: game.gameResult,
        selectedNumber: game.selectedNumber,
        resultNumber: game.status === 'completed' ? game.resultNumber : null,
        betAmount: game.betAmount,
        winningAmount: game.winningAmount,
        timeRemaining: timeRemaining,
        gameName: game.gameConfigId.gameName,
        multiplier: game.gameConfigId.multiplier
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get user game history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const games = await SpinnerGame.find({ user: req.user.id })
      .populate('gameConfigId', 'gameName multiplier')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('betAmount selectedNumber resultNumber winningAmount status gameResult createdAt');

    const total = await SpinnerGame.countDocuments({ user: req.user.id });

    res.json({
      success: true,
      games: games.map(game => ({
        id: game._id,
        gameName: game.gameConfigId.gameName,
        betAmount: game.betAmount,
        selectedNumber: game.selectedNumber,
        resultNumber: game.resultNumber,
        winningAmount: game.winningAmount,
        status: game.status,
        gameResult: game.gameResult,
        playedAt: game.createdAt,
        multiplier: game.gameConfigId.multiplier
      })),
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get user's spinner number history
router.get('/spinner-history', authMiddleware, async (req, res) => {
  try {
    const { gameId, page = 1, limit = 50 } = req.query;

    let query = { user: req.user.id };
    if (gameId) {
      query.gameConfigId = gameId;
    }

    const userHistories = await UserSpinHistory.find(query)
      .populate('gameConfigId', 'gameName')
      .sort({ lastSpinAt: -1 });

    if (userHistories.length === 0) {
      return res.json({
        success: true,
        message: 'No spinner history found',
        histories: [],
        totalSpins: 0
      });
    }

    // If specific game requested, return detailed numbers
    if (gameId) {
      const history = userHistories[0];
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      
      const paginatedNumbers = history.spinnerNumbers
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(startIndex, endIndex);

      return res.json({
        success: true,
        gameName: history.gameConfigId.gameName,
        totalSpins: history.totalSpins,
        spinnerNumbers: paginatedNumbers.map(spin => ({
          number: spin.number,
          timestamp: spin.timestamp,
          gameId: spin.gameId
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(history.spinnerNumbers.length / limit),
          hasNext: endIndex < history.spinnerNumbers.length,
          hasPrev: page > 1
        }
      });
    }

    // Return summary for all games
    const summaries = userHistories.map(history => ({
      gameId: history.gameConfigId?._id,
      gameName: history.gameConfigId?.gameName || 'Unknown',
      totalSpins: history.totalSpins,
      lastSpinAt: history.lastSpinAt,
      recentNumbers: history.spinnerNumbers
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10)
        .map(spin => spin.number)
    }));
    

    res.json({
      success: true,
      histories: summaries,
      totalSpins: userHistories.reduce((sum, h) => sum + h.totalSpins, 0)
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get user's number frequency analysis
router.get('/number-analysis', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.query;

    let query = { user: req.user.id };
    if (gameId) {
      query.gameConfigId = gameId;
    }

    const userHistories = await UserSpinHistory.find(query)
      .populate('gameConfigId', 'gameName');

    if (userHistories.length === 0) {
      return res.json({
        success: true,
        message: 'No data available for analysis',
        analysis: []
      });
    }

    const analysis = userHistories.map(history => {
      // Count frequency of each number (0-9)
      const numberFrequency = {};
      for (let i = 0; i <= 9; i++) {
        numberFrequency[i] = 0;
      }

      history.spinnerNumbers.forEach(spin => {
        numberFrequency[spin.number]++;
      });

      // Calculate percentages
      const frequencyWithPercentage = Object.entries(numberFrequency).map(([number, count]) => ({
        number: parseInt(number),
        count: count,
        percentage: history.totalSpins > 0 ? ((count / history.totalSpins) * 100).toFixed(2) : 0
      }));

      return {
        gameId: history.gameConfigId._id,
        gameName: history.gameConfigId.gameName,
        totalSpins: history.totalSpins,
        numberFrequency: frequencyWithPercentage,
        mostFrequent: frequencyWithPercentage.reduce((prev, current) => 
          (prev.count > current.count) ? prev : current
        ),
        leastFrequent: frequencyWithPercentage.reduce((prev, current) => 
          (prev.count < current.count) ? prev : current
        )
      };
    });

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/recent-results', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const recentGames = await SpinnerGame.find({
      status: 'completed'
    })
    .populate('gameConfigId', 'gameName')
    .populate('user', 'username')
    .sort({ resultGeneratedAt: -1 })
    .limit(parseInt(limit))
    .select('resultNumber gameResult winningAmount betAmount resultGeneratedAt');

    const results = recentGames.map(game => ({
      resultNumber: game.resultNumber,
      gameResult: game.gameResult,
      winningAmount: game.winningAmount,
      betAmount: game.betAmount,
      username: game.user.username,
      gameName: game.gameConfigId.gameName,
      resultTime: game.resultGeneratedAt
    }));

    res.json({
      success: true,
      results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
