const mongoose = require('mongoose');

const InvestmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  dailyROI: { type: Number, default: 0 },
  isCapped: { type: Boolean, default: false },
  daysAccumulated: { type: Number, default: 0 },
});

const Investment = mongoose.models.Investment || mongoose.model('Investment', InvestmentSchema);
module.exports = Investment;
