const User = require('../models/User');
const Investment = require('../models/investment');
const { calculateDailyROI } = require('../utils/calculator');

// Fetch Daily ROI
exports.fetchDailyROI = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id });
    const totalROI = investments.reduce((acc, inv) => acc + inv.dailyROI, 0);
    res.json({ totalROI });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily ROI' });
  }
};

// Update Daily ROI
exports.updateDailyROI = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id });
    for (let investment of investments) {
      investment.dailyROI = calculateDailyROI(investment.amount); // Update based on your calculation logic
      await investment.save();
    }
    res.json({ message: 'Daily ROI updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update daily ROI' });
  }
};

// Withdraw
exports.withdraw = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    user.balance -= amount;
    await user.save();
    res.json({ message: 'Withdrawal successful', balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: 'Withdrawal failed' });
  }
};

// Invest
exports.invest = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (amount < 50 || amount > 10000) {
      return res.status(400).json({ error: 'Investment must be between $50 and $10,000' });
    }

    user.balance += amount; // Update user's balance
    await user.save();

    const investment = new Investment({ user: user._id, amount });
    await investment.save();
    res.json({ message: 'Investment successful', balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: 'Investment failed' });
  }
};
