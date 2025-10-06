const User = require('../models/User');

const rewardReferral = async (userId, amountAdded) => {
  const user = await User.findById(userId).populate('referredBy');

  if (user && user.referredBy) {
    const bonus = amountAdded * 0.05;

    user.referredBy.wallet.balance += bonus;
    user.referredBy.referralEarnings += bonus;

    await user.referredBy.save();
  }
};

module.exports = rewardReferral;
