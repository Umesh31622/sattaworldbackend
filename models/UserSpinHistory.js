// models/UserSpinHistory.js
const mongoose = require('mongoose');

const userSpinHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gameConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameConfig',
    required: true
  },
  spinnerNumbers: [{
    number: {
      type: Number,
      min: 0,
      max: 9,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SpinnerGame'
    }
  }],
  totalSpins: {
    type: Number,
    default: 0
  },
  lastSpinAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for user and game
userSpinHistorySchema.index({ user: 1, gameConfigId: 1 }, { unique: true });

module.exports = mongoose.model('UserSpinHistory', userSpinHistorySchema);