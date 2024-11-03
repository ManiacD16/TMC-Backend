// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   publicKey: { type: String, required: true, unique: true },
//   balance: { type: Number, default: 0 },
//   investmentTotal: { type: Number, default: 0 },
//   referralIncome: { type: Number, default: 0 },
//   autoInvestEnabled: { type: Boolean, default: false },
//   investmentCap: { type: Number, default: 10000 },
// }, { timestamps: true });

// module.exports = mongoose.model('User', userSchema);
// models/user.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  investmentTotal: { type: Number, default: 0 },
  autoInvestEnabled: { type: Boolean, default: false },
  investmentCap: { type: Number, default: 10000 },
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);
module.exports = User;
