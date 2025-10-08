// // models/Result.js
// const mongoose = require('mongoose');
// const resultSchema = new mongoose.Schema({
//     gameId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Game',
//       required: true
//     },
//     date: {
//       type: Date,
//       required: true
//     },
//     openResult: {
//       type: Number
//     },
//     closeResult: {
//       type: Number
//     },
//     spinnerResult: {
//       type: Number
//     },
//     isActive: {
//       type: Boolean,
//       default: true
//     },
//     status: {  // ⬅️ Add this field
//       type: String,
//       enum: ['draft', 'published'],
//       default: 'published'
//     },
//     scheduledPublishTime: {  // ⬅️ Add this field
//       type: Date
//     },
//      // Add TTL field - will auto-delete after 24 hours
     
//     declaredAt: {
//       type: Date,
//       default: Date.now
//     },
//     expiresAt: {
//       type: Date,
//       default: function() {
//         return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
//         // return new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

//       },
//       expires: 0 // MongoDB TTL index
//     }
//   });
//   resultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

//   module.exports = mongoose.model('Result', resultSchema);
  // models/Result.js
const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  date: { type: Date, required: true },
  openResult: Number,
  closeResult: Number,
  spinnerResult: Number,
  isActive: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  scheduledPublishTime: Date,
  declaredAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: function () {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    },
    expires: 0 // TTL index handled here
  }
});

module.exports = mongoose.model('Result', resultSchema);
