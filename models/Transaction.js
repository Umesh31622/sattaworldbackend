
const mongoose = require('mongoose');
const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'bet', 'win', 'referral', 'commission'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'admin_pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['paytm', 'googlepay', 'bank_transfer', 'upi', 'wallet', 'razorpay'],
    required: true
  },
  paymentDetails: {
    mobileNumber: String,
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    upiId: String,
    transactionId: String,
    reference: String
  },
  description: {
    type: String,
    required: true
  },
  adminNotes: String,
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  paymentScreenshot: {
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
}, {
  timestamps: true
});
module.exports = mongoose.model('Transaction', transactionSchema);