const User = require("../models/User");
const Investment = require("../models/investment");
const { calculateDailyROI, calculateYield } = require("../utils/calculator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

// Helper function to set JWT in an HTTP-only cookie
const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Only send over HTTPS in production
    sameSite: "strict",
    maxAge: 60 * 60 * 1000, // 1 hour
  });
};

// Register new user
exports.register = async (req, res) => {
  const { email, password, referralEmail } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User already exists with this email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });

    // Handle referral bonus if referralEmail is provided
    if (referralEmail) {
      const referrer = await User.findOne({ email: referralEmail });
      if (referrer) {
        referrer.balance += 10; // Referral bonus
        await referrer.save();
        user.referrer = referrer._id;
      }
    }

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// User login with cookie-based token
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    setTokenCookie(res, token);
    res.json({
      message: "Login successful",
      user: { email: user.email, balance: user.balance },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// Logout user and clear cookie
exports.logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};

// Fetch User Data excluding password
exports.fetchUserData = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(user);
  } catch (error) {
    console.error("Fetch User Data Error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};

// Fetch Total Daily ROI from investments
exports.fetchDailyROI = async (req, res) => {
  try {
    // Debug log to check if req.userID is correctly set
    console.log("User ID from request:", req.userID);

    if (!req.userID) {
      return res
        .status(400)
        .json({ error: "User ID not found in the request" });
    }

    const investments = await Investment.find({ user: req.userID });
    if (!investments || investments.length === 0) {
      return res
        .status(404)
        .json({ error: "No investments found for the user" });
    }

    const totalROI = investments.reduce(
      (acc, inv) => acc + (inv.dailyROI || 0),
      0
    );
    res.json({ totalROI });
  } catch (error) {
    console.error("Fetch Daily ROI Error:", error);
    res.status(500).json({ error: "Failed to fetch daily ROI" });
  }
};

// Update Daily ROI for all user's active investments
exports.updateDailyROI = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id });
    for (let investment of investments) {
      investment.dailyROI = calculateDailyROI(investment.amount);
      await investment.save();
    }
    res.json({ message: "Daily ROI updated successfully" });
  } catch (error) {
    console.error("Update Daily ROI Error:", error);
    res.status(500).json({ error: "Failed to update daily ROI" });
  }
};

// User withdrawal
exports.withdraw = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    user.balance -= amount;
    await user.save();
    res.json({ message: "Withdrawal successful", balance: user.balance });
  } catch (error) {
    console.error("Withdrawal Error:", error);
    res.status(500).json({ error: "Withdrawal failed" });
  }
};

// Invest with cap check
exports.invest = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    const activeInvestments = await Investment.aggregate([
      { $match: { user: user._id, isActive: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const activeInvestmentTotal = activeInvestments[0]?.total || 0;
    const newActiveInvestmentTotal = activeInvestmentTotal + amount;

    if (newActiveInvestmentTotal > 10000) {
      return res.status(400).json({
        error: "Total active investments cannot exceed $10,000 at a time.",
      });
    }

    if (amount < 50 || amount > 10000) {
      return res.status(400).json({
        error: "Individual investment amount must be between $50 and $10,000",
      });
    }

    const investment = new Investment({
      user: user._id,
      amount,
      isActive: true,
    });
    await investment.save();
    res.json({ message: "Investment successful", newActiveInvestmentTotal });
  } catch (error) {
    console.error("Investment Error:", error);
    res.status(500).json({ error: "Investment failed" });
  }
};

// Direct Referral Bonus
exports.directReferralBonus = async (req, res) => {
  const { referralEmail, investmentAmount } = req.body;

  try {
    const referrer = await User.findOne({ email: referralEmail });
    if (!referrer) {
      return res.status(404).json({ error: "Referrer not found" });
    }

    const bonus = investmentAmount * 0.2;
    referrer.balance += bonus;
    await referrer.save();
    res.json({ message: "Direct referral bonus credited", bonus });
  } catch (error) {
    console.error("Referral Bonus Error:", error);
    res.status(500).json({ error: "Failed to credit referral bonus" });
  }
};

// Check Yield Package Eligibility
exports.checkYieldPackageEligibility = async (req, res) => {
  const { amount } = req.body;

  try {
    const package = calculateYield(amount);
    if (!package) {
      return res.status(400).json({ error: "Invalid yield package amount" });
    }
    res.json({ message: "Eligible for yield package", package });
  } catch (error) {
    console.error("Check Yield Package Error:", error);
    res
      .status(500)
      .json({ error: "Failed to check eligibility for yield package" });
  }
};

// Calculate Level ROI
exports.calculateLevelROI = async (req, res) => {
  const { level, directReferrals, amount } = req.body;

  try {
    let roiPercentage;
    if (directReferrals < 5) {
      roiPercentage = level <= 5 ? 0.1 : 0.01;
    } else {
      roiPercentage = level === 1 ? 0.1 : level <= 5 ? 0.5 : 0.02;
    }

    const roi = amount * roiPercentage;
    res.json({ message: "ROI calculated based on level and referrals", roi });
  } catch (error) {
    console.error("Level ROI Calculation Error:", error);
    res.status(500).json({ error: "Failed to calculate level ROI" });
  }
};

// Check Rank Qualification
exports.checkRankQualification = async (req, res) => {
  const { rank, businessVolume, referrals } = req.body;

  try {
    let isQualified = false;
    let reward = 0;

    switch (rank) {
      case "TMC PLUS":
        isQualified = businessVolume >= 2500 && referrals >= 5;
        reward = isQualified ? 500 : 0;
        break;
      case "TMC PRO":
        isQualified = referrals >= 15 && businessVolume >= 15000;
        reward = isQualified ? 2000 : 0;
        break;
      default:
        return res.status(400).json({ error: "Invalid rank" });
    }

    res.json({ isQualified, reward });
  } catch (error) {
    console.error("Rank Qualification Error:", error);
    res.status(500).json({ error: "Failed to check rank qualification" });
  }
};

// Calculate Daily Capping
exports.calculateDailyCapping = async (req, res) => {
  const { dailyReturn } = req.body;

  try {
    const cappedReturn = Math.min(dailyReturn, 20000);
    res.json({ message: "Daily capping calculated", cappedReturn });
  } catch (error) {
    console.error("Daily Capping Error:", error);
    res.status(500).json({ error: "Failed to calculate daily capping" });
  }
};
