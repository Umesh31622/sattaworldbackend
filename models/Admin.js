// models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  earnings: {   // ✅ NEW FIELD
    type: Number,
    default: 0
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'super_admin'],
    default: 'admin'
  },
   profileImage: {
    type: String, // will store the image URL
    default: 'https://t3.ftcdn.net/jpg/09/48/09/30/360_F_948093078_6kRWXnAWFNEaakRMX5OM9CRNNj2gdIfw.jpg'   // default empty string
  },
  permissions: [{
    type: String,
    enum: ['users', 'games', 'rates', 'results', 'withdrawals', 'reports', 'settings']
  }],
  bidAmount: {
    type: Number,
    default: 0
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
module.exports = mongoose.model('Admin', adminSchema);
