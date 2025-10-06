
// models/GameRate.js
const mongoose = require('mongoose');

const gameRateSchema = new mongoose.Schema({
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true
    },
    rateType: {
      type: String,
      enum: ['single_digit', 'jodi_digit', 'spinner'],
      required: true
    },
    rate: {
      type: Number,
      required: true
    },
    minBet: {
      type: Number,
      default: 10
    },
    maxBet: {
      type: Number,
      default: 10000
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  });
  
  module.exports = mongoose.model('GameRate', gameRateSchema);
  