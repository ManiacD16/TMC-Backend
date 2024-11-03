const User = require('../models/User');
const Investment = require('../models/investment');
const { calculateDailyROI, checkInvestmentCap } = require('../utils/calculations');

exports.createInvestment = async (userId, amount) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const isCapExceeded = checkInvestmentCap(user.investmentTotal, amount);
  if (!isCapExceeded) {
    throw new Error('Investment cap exceeded');
  }

  const dailyROI = calculateDailyROI(amount);
  const investment = new Investment({
    user: user._id,
    amount,
    dailyROI,
  });

  user.investmentTotal += amount;
  await user.save();
  await investment.save();

  return investment;
};
