const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  minimumDeposit: {
    type: Number,
    default: 100
  },
  minimumWithdrawal: {
    type: Number,
    default: 500
  },
  withdrawalTimings: {
    isActive: { type: Boolean, default: false },
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '21:00' }
  },
  adminPaymentDetails: {
    bankDetails: {
      accountHolderName: { type: String, default: 'Satta World App' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      branch: { type: String, default: '' }
    },
    upiDetails: {
      upiId: { type: String, default: '' },
      upiQr: { type: String, default: '' }
    },
    paytmDetails: {
      mobileNumber: { type: String, default: '' },
      paytmQr: { type: String, default: '' }
    },
    googlePayDetails: {
      mobileNumber: { type: String, default: '' },
      gpayQr: { type: String, default: '' }
    }
  },
  paymentInstructions: {
    deposit: [{ type: String }],
    withdrawal: [{ type: String }]
  },
  autoApproval: {
    enabled: { type: Boolean, default: false },
    maxAmount: { type: Number, default: 1000 }
  }
}, {
  timestamps: true
});

// Set default instructions if not present
settingsSchema.pre('save', function(next) {
  if (!this.paymentInstructions.deposit || this.paymentInstructions.deposit.length === 0) {
    this.paymentInstructions.deposit = [
      'Transfer the exact amount to the provided account details',
      'Take a screenshot of the payment confirmation',
      'Upload the screenshot and provide transaction ID',
      'Wait for admin approval (usually within 24 hours)',
      'Do not share your payment details with anyone else'
    ];
  }

  if (!this.paymentInstructions.withdrawal || this.paymentInstructions.withdrawal.length === 0) {
    this.paymentInstructions.withdrawal = [
      'Fill out the withdrawal form with your payment details',
      'Upload your QR code or provide account details',
      'Ensure you have sufficient balance in your wallet',
      'Wait for admin approval and processing',
      'Funds will be transferred to your provided account'
    ];
  }

  next();
});

module.exports = mongoose.model('AdminSettings', settingsSchema);
