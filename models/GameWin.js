// models/GameWin.js
const mongoose = require('mongoose');

const gameWinSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  betAmount: {
    type: Number,
    required: true
  },
  winAmount: {
    type: Number,
    required: true
  },
  betType: {
    type: String,
    enum: ['single_digit', 'jodi_digit', 'spinner'],
    required: true
  },
  winningNumber: {
    type: Number,
    required: true
  },
  resultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Result',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameWin', gameWinSchema);