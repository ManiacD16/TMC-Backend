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

// Register
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

    if (referralEmail) {
      const referrer = await User.findOne({ email: referralEmail });
      if (referrer) {
        referrer.balance += 10;
        await referrer.save();
        user.referrer = referrer._id;
      }
    }

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// Login with cookie-based token
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
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// Logout by clearing cookie
exports.logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};

// Fetch User Data
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

// Fetch Daily ROI
exports.fetchDailyROI = async (req, res) => {
  try {
    // Ensure req.user.id is available
    if (!req.user || !req.user.id) {
      return res.status(400).json({ error: "User not authenticated" });
    }

    // Fetch investments for the authenticated user
    const investments = await Investment.find({ user: req.user.id });

    // If no investments found, handle gracefully
    if (investments.length === 0) {
      return res
        .status(404)
        .json({ error: "No investments found for this user" });
    }

    // Calculate the total ROI
    const totalROI = investments.reduce(
      (acc, inv) => acc + (inv.dailyROI || 0),
      0
    );

    // Return the total ROI to the client
    res.json({ totalROI });
  } catch (error) {
    console.error("Error fetching daily ROI:", error);
    // Return a 500 status with the error message
    res.status(500).json({ error: "Failed to fetch daily ROI" });
  }
};

// Update Daily ROI
exports.updateDailyROI = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id });
    for (let investment of investments) {
      investment.dailyROI = calculateDailyROI(investment.amount);
      await investment.save();
    }
    res.json({ message: "Daily ROI updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update daily ROI" });
  }
};

// Withdraw
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
    res.status(500).json({ error: "Withdrawal failed" });
  }
};

// Invest with Cap Check
exports.invest = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    const activeInvestments = await Investment.aggregate([
      { $match: { user: user.id, isActive: true } },
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

    // Create new investment
    const investment = new Investment({
      user: user._id,
      amount,
      isActive: true,
    });
    await investment.save();

    // Deduct the investment amount from user's balance
    user.balance = amount;
    await user.save(); // Save the updated balance

    // Return the updated balance along with a success message
    res.json({
      message: "Investment successful",
      newBalance: user.balance, // Return the updated balance
      newActiveInvestmentTotal,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Fetch total investment for the authenticated user
exports.fetchTotalInvestment = async (req, res) => {
  try {
    // Find all investments for the authenticated user
    const investments = await Investment.find({ user: req.user.id });

    // Calculate the total investment by summing the amounts
    const totalInvestment = investments.reduce((total, investment) => {
      return total + investment.amount;
    }, 0);

    // Send the total investment back to the frontend
    res.json({ totalInvestment });
  } catch (error) {
    console.error("Error fetching total investment:", error);
    res.status(500).json({ error: "Failed to fetch total investment" });
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
    res
      .status(500)
      .json({ error: "Failed to check eligibility for yield package" });
  }
};

// Calculate Level ROI
exports.calculateLevelROI = async (req, res) => {
  const { level, directReferrals, amount } = req.body;

  try {
    // Ensure that the user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    // Log the authenticated user (for debugging)
    console.log("Authenticated user:", req.user); // This will log the full user object

    const user = req.user; // Access the authenticated user object

    // Ensure that all required fields are provided in the request body
    if (!level || !directReferrals || !amount) {
      return res.status(400).json({
        error: "Missing required fields: level, directReferrals, amount",
      });
    }

    // Ensure the amount is a valid number and within expected range
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount provided. It must be a positive number.",
      });
    }

    // Calculate ROI percentage based on level and direct referrals
    let roiPercentage;

    if (directReferrals < 5) {
      roiPercentage = level <= 5 ? 0.1 : 0.01;
    } else {
      roiPercentage = level === 1 ? 0.1 : level <= 5 ? 0.5 : 0.02;
    }

    // Calculate the ROI based on the amount and ROI percentage
    const roi = amount * roiPercentage;

    // Optionally, you can save this ROI calculation to the database if needed
    // Example: Record this ROI in the user's investment history
    const investment = new Investment({
      user: user._id,
      amount: amount,
      roiPercentage: roiPercentage,
      roi: roi,
      type: "Level ROI",
    });
    await investment.save();

    // Respond with a success message and the calculated ROI
    res.json({
      message: "ROI calculated successfully based on level and referrals",
      roi,
      roiPercentage,
      level,
      directReferrals,
      amount,
    });
  } catch (error) {
    // Log any unexpected errors for debugging purposes
    console.error("Error in calculateLevelROI:", error);

    // Return a 500 error if something goes wrong during processing
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
    res.status(500).json({ error: "Failed to calculate daily capping" });
  }
};
