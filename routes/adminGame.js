// routes/adminGame.js
const express = require('express');
const router = express.Router();
const GameConfig = require('../models/GameConfig');
const SpinnerGame = require('../models/SpinnerGame');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId);

    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: 'Invalid admin token' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin: Upload/Create new game
router.post('/upload-game', adminAuthMiddleware, async (req, res) => {
  try {
    const { 
      gameName, 
      resultInterval,
      minBet = 10,
      maxBet = 10000,
      multiplier = 9,
      description = 'Select a number (0-9) and spin to win!'
    } = req.body;

    // Validation
    if (!gameName || !resultInterval) {
      return res.status(400).json({ 
        error: 'Game name and result interval are required' 
      });
    }

    if (resultInterval < 1) {
      return res.status(400).json({ 
        error: 'Result interval must be at least 1 minute' 
      });
    }

    // Check if game already exists
    const existingGame = await GameConfig.findOne({ gameName });
    if (existingGame) {
      return res.status(400).json({ 
        error: 'Game with this name already exists' 
      });
    }

    // Create new game configuration
    const gameConfig = new GameConfig({
      gameName,
      resultInterval,
      minBet,
      maxBet,
      multiplier,
      description
    });

    await gameConfig.save();

    res.json({
      success: true,
      message: 'Game uploaded successfully',
      gameConfig: {
        id: gameConfig._id,
        gameName: gameConfig.gameName,
        resultInterval: gameConfig.resultInterval,
        minBet: gameConfig.minBet,
        maxBet: gameConfig.maxBet,
        multiplier: gameConfig.multiplier,
        description: gameConfig.description,
        isActive: gameConfig.isActive
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all games
router.get('/games', adminAuthMiddleware, async (req, res) => {
  try {
    const games = await GameConfig.find({});
    
    res.json({
      success: true,
      games
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update game configuration
router.put('/games/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    const updates = req.body;

    const game = await GameConfig.findByIdAndUpdate(
      gameId, 
      updates, 
      { new: true, runValidators: true }
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      success: true,
      message: 'Game updated successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Set next results for a game
router.post('/set-results/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { results } = req.body; // Array of numbers [1, 7, 3, 9, 2]

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ 
        error: 'Results array is required' 
      });
    }

    // Validate all numbers are between 0-9
    const invalidNumbers = results.filter(num => num < 0 || num > 9 || !Number.isInteger(num));
    if (invalidNumbers.length > 0) {
      return res.status(400).json({ 
        error: 'All numbers must be integers between 0-9' 
      });
    }

    const gameConfig = await GameConfig.findById(gameId);
    if (!gameConfig) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Add new results to the queue
    const newResults = results.map(num => ({
      resultNumber: num,
      isUsed: false,
      createdAt: new Date()
    }));

    gameConfig.nextResults.push(...newResults);
    await gameConfig.save();

    res.json({
      success: true,
      message: `${results.length} results added to queue`,
      addedResults: results,
      totalPendingResults: gameConfig.nextResults.filter(r => !r.isUsed).length
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get pending results for a game
router.get('/pending-results/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const gameConfig = await GameConfig.findById(gameId);
    if (!gameConfig) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const pendingResults = gameConfig.nextResults
      .filter(result => !result.isUsed)
      .map(result => ({
        id: result._id,
        number: result.resultNumber,
        createdAt: result.createdAt
      }));

    const usedResults = gameConfig.nextResults
      .filter(result => result.isUsed)
      .map(result => ({
        id: result._id,
        number: result.resultNumber,
        usedAt: result.usedAt,
        createdAt: result.createdAt
      }))
      .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt))
      .slice(0, 20); // Last 20 used results

    res.json({
      success: true,
      gameName: gameConfig.gameName,
      resultMode: gameConfig.resultMode,
      pendingResults,
      recentUsedResults: usedResults,
      pendingCount: pendingResults.length
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Admin: Clear all pending results
router.delete('/clear-results/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    const gameConfig = await GameConfig.findById(gameId);
    if (!gameConfig) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const pendingCount = gameConfig.nextResults.filter(r => !r.isUsed).length;
    
    // Remove unused results
    gameConfig.nextResults = gameConfig.nextResults.filter(r => r.isUsed);
    await gameConfig.save();

    res.json({
      success: true,
      message: `${pendingCount} pending results cleared`,
      remainingUsedResults: gameConfig.nextResults.length
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Admin: Toggle result mode (admin_controlled / random)
router.put('/result-mode/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { mode } = req.body; // 'admin_controlled' or 'random'

    if (!['admin_controlled', 'random'].includes(mode)) {
      return res.status(400).json({ 
        error: 'Mode must be either admin_controlled or random' 
      });
    }

    const gameConfig = await GameConfig.findById(gameId);
    if (!gameConfig) {
      return res.status(404).json({ error: 'Game not found' });
    }

    gameConfig.resultMode = mode;
    await gameConfig.save();

    res.json({
      success: true,
      message: `Result mode changed to ${mode}`,
      resultMode: gameConfig.resultMode
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/statistics', adminAuthMiddleware, async (req, res) => {
  try {
    const stats = await SpinnerGame.aggregate([
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalBetAmount: { $sum: '$betAmount' },
          totalWinnings: { $sum: '$winningAmount' },
          totalProfit: { 
            $sum: { $subtract: ['$betAmount', '$winningAmount'] } 
          },
          completedGames: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          pendingGames: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          }
        }
      }
    ]);

    const gameStats = await SpinnerGame.aggregate([
      {
        $lookup: {
          from: 'gameconfigs',
          localField: 'gameConfigId',
          foreignField: '_id',
          as: 'gameConfig'
        }
      },
      {
        $unwind: '$gameConfig'
      },
      {
        $group: {
          _id: '$gameConfig.gameName',
          totalGames: { $sum: 1 },
          totalBetAmount: { $sum: '$betAmount' },
          totalWinnings: { $sum: '$winningAmount' },
          profit: { $sum: { $subtract: ['$betAmount', '$winningAmount'] } }
        }
      }
    ]);

    res.json({
      success: true,
      overallStats: stats[0] || {
        totalGames: 0,
        totalBetAmount: 0,
        totalWinnings: 0,
        totalProfit: 0,
        completedGames: 0,
        pendingGames: 0
      },
      gameStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
