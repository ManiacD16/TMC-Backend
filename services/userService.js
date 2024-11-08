const User = require("../models/User");

exports.registerUser = async (address) => {
  const existingUser = await User.findOne({ address });
  if (existingUser) {
    throw new Error("User already registered");
  }
  const user = new User({ address });
  await user.save();
  return user;
};
