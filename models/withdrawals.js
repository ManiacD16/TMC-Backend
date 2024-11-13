const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  requestID: { type: String, required: true },
  amount: { type: Number, required: true },
  withdrawalType: {type: String, required: true},
  fundsTransferred: { type: Boolean, default: false },
  hasInitiated: {type: Boolean, default: false},
  newBalance: {type: Number, default: 0},
  userAddress: {type: String, default: ""},
  createdAt: { type: Date, default: new Date() },
  updatedAt: { type: Date, default: new Date() }
});

const Withdrawals =
  mongoose.models.Withdrawals || mongoose.model("Withdrawals", WithdrawalSchema);
module.exports = Withdrawals;
