
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  openDateTime: { // ⬅️ full datetime
    type: Date,
    required: true
  },
  closeDateTime: { // ⬅️ full datetime
    type: Date,
    required: true
  },
  resultDateTime: { // ⬅️ full datetime
    type: Date,
    required: true
  },
   // 👇 Add this field for soft delete
   isDeleted: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed'],
    default: 'active'
  },
  gameType: {
    type: String,
    enum: ['regular', 'hard'],
    default: 'regular'
  },
  rates: {
    singleDigit: {
      type: Number,
      default: 9
    },
    jodiDigit: {
      type: Number,
      default: 950
    }
  },
  currentResult: {
    number: Number,
    date: Date
  },
  lastResults: [{
    number: Number,
    date: Date
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Game', gameSchema);
