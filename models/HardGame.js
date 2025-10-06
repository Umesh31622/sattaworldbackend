const mongoose = require('mongoose');

const hardGameSchema = new mongoose.Schema({
  gameName: {
    type: String,
    trim: true,
    required: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  betAmount: {
    type: Number,
    min: 1
  },
  selectedNumber: {
    type: Number,
    min: 0,
    max: 9
  },
  resultNumber: {
    type: Number,
    min: 0,
    max: 9
  },
  winningAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'won', 'lost'],
    default: 'pending'
  },
  nextResultTime: {
    type: Date,
    required: true
  },
  gameDate: {
    type: Date,
    default: Date.now
  },
   // Add this field to store the interval in minutes
   resultInterval: {
    type: Number,
    required: true // Time in minutes after user plays
  },
  previousResults: [{
    resultNumber: {
      type: Number,
      min: 0,
      max: 9
    },
    resultTime: {
      type: Date
    }
  }]
}, {
  timestamps: true
});


module.exports = mongoose.model('HardGame', hardGameSchema);
