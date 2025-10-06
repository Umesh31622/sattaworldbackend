const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: false,
    unique: true,
      sparse: true, // 👈 allow multiple nulls
    trim: true,
     default: '' ,
  },
  profileImage: {
    type: String, // will store the image URL
    default: 'https://t3.ftcdn.net/jpg/09/48/09/30/360_F_948093078_6kRWXnAWFNEaakRMX5OM9CRNNj2gdIfw.jpg'   // default empty string
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  depositScreenshots: [
    {
      url: String,
      transactionId: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],  
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    totalDeposits: {
      type: Number,
      default: 0
    },
    totalWithdrawals: {
      type: Number,
      default: 0
    },
    totalWinnings: {
      type: Number,
      default: 0
    },
    commission: {
      type: Number,
      default: 0
    }
  },
  referralCode: {
    type: String,
    unique: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralEarnings: {
    type: Number,
    default: 0
  },
  paymentDetails: {
    paytmNumber: String,
    googlePayNumber: String,
    preferredMethod: {
      type: String,
      enum: ['paytm', 'googlepay'],
      default: 'paytm'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};
userSchema.pre('save', function(next) {
    if (!this.referralCode) {
      // Generate a random 8-character referral code
      this.referralCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    }
    next();
  });
module.exports = mongoose.model('User', userSchema);
