const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
  investmentTotal: {
    type: Number,
    default: 0,
  },
  autoInvestEnabled: {
    type: Boolean,
    default: false,
  },
  investmentCap: {
    type: Number,
    default: 10000,
  },
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  tokens: [
    {
      token: {
        type: String,
        required: true,
      },
    },
  ],
});

// Hash the password before saving
userSchema.pre("save", async function (next) {
  console.log("Hii I am Meta ");
  if (this.isModified("password")) {
    console.log("Hii I am pre password ");
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// Generate an authentication token
userSchema.methods.generateAuthToken = async function () {
  try {
    const token = jwt.sign(
      { _id: this._id },
      process.env.JWT_SECRET
      // expiresIn: "1h", // Token expiration
    );
    this.tokens = this.tokens.concat({ token: token });
    await this.save();
    return token;
  } catch (err) {
    console.error("Error generating token:", err);
    throw new Error("Token generation failed.");
  }
};

// Add a message (You may want to adjust this depending on your use case)
userSchema.methods.addMessage = async function (messageDetails) {
  try {
    // Assuming messageDetails is an object with the required fields
    this.messages.push(messageDetails);
    await this.save();
    return this.messages;
  } catch (error) {
    console.error("Error adding message:", error);
    throw new Error("Failed to add message.");
  }
};

// Static method to find a user by email
userSchema.statics.findByEmail = async function (email) {
  return await this.findOne({ email });
};

// Static method to validate password
userSchema.statics.validatePassword = async function (
  inputPassword,
  storedPassword
) {
  return await bcrypt.compare(inputPassword, storedPassword);
};

// Update balance or investment total
userSchema.methods.updateBalance = async function (amount) {
  this.balance += amount;
  await this.save();
  return this.balance;
};

userSchema.methods.updateInvestmentTotal = async function (amount) {
  this.investmentTotal += amount;
  await this.save();
  return this.investmentTotal;
};

// Collection creation
const User = mongoose.models.User || mongoose.model("User", userSchema);
module.exports = User;
