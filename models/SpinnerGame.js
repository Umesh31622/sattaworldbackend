const mongoose = require('mongoose');

const spinnerGameSchema = new mongoose.Schema({
  gameConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameConfig',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  betAmount: {
    type: Number,
    required: true,
    min: 1
  },
  selectedNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 9
  },
  resultNumber: {
    type: Number,
    min: 0,
    max: 9,
    default: null
  },
  winningAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'spinning', 'completed', 'cancelled'],
    default: 'pending'
  },
  gameResult: {
    type: String,
    enum: ['won', 'lost', 'pending'],
    default: 'pending'
  },
  spinStartTime: {
    type: Date,
    default: null
  },
  spinEndTime: {
    type: Date,
    default: null
  },
  lastSpinAt: {
    type: Date,
    default: null
  }
,  
  resultGeneratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SpinnerGame', spinnerGameSchema);