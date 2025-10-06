const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  withdrawalTimings: {
    startTime: {
      type: String,
      default: '10:00'
    },
    endTime: {
      type: String,
      default: '18:00'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  gameRates: {
    singleDigit: {
      type: Number,
      default: 9
    },
    jodiDigit: {
      type: Number,
      default: 950
    }
  },
  referralCommission: {
    type: Number,
    default: 5
  },
  minimumDeposit: {
    type: Number,
    default: 100
  },
  minimumWithdrawal: {
    type: Number,
    default: 500
  },
  hardGameMultiplier: {
    type: Number,
    default: 9
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);
