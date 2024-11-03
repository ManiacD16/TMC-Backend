const User = require("../models/User");

exports.registerUser = async (email) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User already registered");
  }
  const user = new User({ email });
  await user.save();
  return user;
};
