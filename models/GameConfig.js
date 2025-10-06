
// models/GameConfig.js
const mongoose = require('mongoose');

const gameConfigSchema = new mongoose.Schema({
  gameName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  resultInterval: {
    type: Number,
    required: true,
    min: 1, // minimum 1 minute
    default: 5 // default 5 minutes
  },
  lastResultTime: {
    type: Date,
    default: null
  },  
  isActive: {
    type: Boolean,
    default: true
  },
  minBet: {
    type: Number,
    default: 10
  },
  maxBet: {
    type: Number,
    default: 10000
  },
  multiplier: {
    type: Number,
    default: 9 // 9x payout for correct guess
  },
  description: {
    type: String,
    default: 'Select a number (0-9) and spin to win!'
  },
  // Admin controlled results
  nextResults: [{
    resultNumber: {
      type: Number,
      min: 0,
      max: 9,
      required: true
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    usedAt: {
      type: Date,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  resultMode: {
    type: String,
    enum: ['admin_controlled', 'random'],
    default: 'admin_controlled'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameConfig', gameConfigSchema);
