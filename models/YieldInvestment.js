const mongoose = require("mongoose");

const YieldInvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dailyROI: { type: Number, default: 0 },
  amount: { type: Number, required: true },
  packageType: { type: String, default: 0 },
  liquidityFee: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  hasInitiated: {type: Boolean, default: false},
  actualInvestment: {type: Number, default: 0},
  daysAccumulated: {type: Number, default: 0},
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


const YieldInvestment =
  mongoose.models.YieldInvestment || mongoose.model("YieldInvestment", YieldInvestmentSchema);
module.exports = YieldInvestment;
