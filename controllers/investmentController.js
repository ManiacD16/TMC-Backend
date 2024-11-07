const User = require("../models/User");
const Investment = require("../models/investment");
const {
  calculateDailyROI,
  calculateYield,
  calculateLiquidityFee,
  calculateLevelROI,
} = require("../utils/calculator");
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
    if (!req.user || !req.user.id) {
      return res.status(400).json({ error: "User not authenticated" });
    }

    const investments = await Investment.find({ user: req.user.id });
    if (investments.length === 0) {
      return res
        .status(404)
        .json({ error: "No investments found for this user" });
    }

    const totalROI = investments.reduce(
      (acc, inv) => acc + (inv.dailyROI || 0),
      0
    );

    res.json({ totalROI });
  } catch (error) {
    console.error("Error fetching daily ROI:", error);
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

// Withdraw funds for the authenticated user
exports.withdraw = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    user.balance -= amount;
    await user.save();

    res.json({
      message: "Withdrawal successful",
      newBalance: user.balance,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to withdraw funds" });
  }
};

// Invest with Cap Check
// Invest with Cap Check
// Invest with Cap Check
exports.invest = async (req, res) => {
  const { amount, packageType } = req.body;

  try {
    // Fetch the user based on the ID in the JWT
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure that the amount is a valid number (it could be a string from the request)
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      return res
        .status(400)
        .json({ error: "Investment amount must be a valid number" });
    }

    // Calculate the liquidity fee (1% of the investment amount)
    const liquidityFee = calculateLiquidityFee(numericAmount);
    const totalAmountRequired = numericAmount + liquidityFee;

    // Check if the investment amount is within the allowed range
    if (numericAmount < 50 || numericAmount > 10000) {
      return res.status(400).json({
        error: "Investment amount must be between $50 and $10,000",
      });
    }

    // Create a new investment record
    const investment = new Investment({
      user: user._id,
      amount: numericAmount,
      packageType,
      liquidityFee,
      isActive: true,
    });

    await investment.save(); // Save the new investment
    console.log("Investment saved:", investment); // Debugging step

    // Update the user's total investment (investmentTotal) by adding the current investment amount
    user.investmentTotal += numericAmount; // Ensure it's adding a number
    await user.save(); // Save the updated total investment
    console.log("User updated:", user); // Debugging step

    // Fetch the updated total active investment for the user
    const activeInvestments = await Investment.aggregate([
      { $match: { user: user.id, isActive: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const activeInvestmentTotal = activeInvestments[0]?.total || 0;
    const newActiveInvestmentTotal = activeInvestmentTotal + amount;
    console.log("Total Active Investment:", newActiveInvestmentTotal); // Debugging step

    // Optionally, calculate and apply the yield package (if needed)
    const yieldPackage = calculateYield(numericAmount);
    if (yieldPackage) {
      // Optional logic to handle yield package saving
    }

    // Return the updated total active investment and other details to the frontend
    res.json({
      message: "Investment successful",
      newActiveInvestmentTotal, // Send the updated total active investment
      liquidityFee,
      yieldPackage,
      userInvestmentTotal: user.investmentTotal, // Send total investment
    });
  } catch (error) {
    console.error("Investment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getUserInvestmentTotal = async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // Get user from JWT

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Send the user's total investment back
    res.json({
      investmentTotal: user.investmentTotal, // Send the total investment
    });
  } catch (error) {
    console.error("Error fetching investment total:", error);
    res.status(500).json({ error: "Failed to fetch investment total" });
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

// Check Eligibility for Yield Package
exports.checkYieldPackageEligibility = async (req, res) => {
  const { amount } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Example logic to check eligibility (this could be based on user balance or investment history)
    const isEligible = amount >= 1000; // Example condition

    res.json({
      message: isEligible
        ? "Eligible for yield package"
        : "Not eligible for yield package",
      isEligible,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check eligibility" });
  }
};

// Calculate Level ROI
exports.calculateLevelROI = async (req, res) => {
  try {
    // Check if the user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    // const user = req.user; // Get the logged-in user

    // Fetch user data from the database (e.g., level, and amount)
    const user = await User.findById(user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log the user data to debug
    console.log("User Data:", user);

    const level = user.level; // Level from user data
    const amount = user.amount; // Amount from user data (e.g., balance or investment)

    // Check if level and amount are missing or invalid
    if (!level || !amount) {
      return res.status(400).json({
        error: "Missing required fields: level or amount in the user data",
      });
    }

    // Calculate the number of direct referrals for the user
    const directReferrals = await User.countDocuments({ referrer: user.id });

    if (directReferrals === null) {
      return res.status(400).json({
        error: "Error counting direct referrals",
      });
    }

    // Calculate the ROI based on the level, direct referrals, and amount
    const roi = calculateLevelROI(level, directReferrals, amount);

    // Save the investment record for the user
    const investment = new Investment({
      user: user.id,
      amount,
      roiPercentage: roi.percentage,
      roi: roi.value,
      type: "Level ROI",
    });
    await investment.save();

    // Calculate ROI for each referral
    const referralInvestments = [];
    const referrals = await User.find({ referrer: user.id });

    for (const referral of referrals) {
      const referralRoi = calculateLevelROI(referral.level, 0, amount);
      const referralInvestment = new Investment({
        user: referral.id,
        amount, // Same investment amount as the user
        roiPercentage: referralRoi.percentage,
        roi: referralRoi.value,
        type: "Referral Level ROI",
      });

      await referralInvestment.save();
      referralInvestments.push(referralInvestment);
    }

    // Send the response with the calculated ROI and referral investments
    res.json({
      message: "ROI calculated successfully based on level and referrals",
      roi: roi.value,
      roiPercentage: roi.percentage,
      directReferrals,
      amount,
      referralInvestments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to calculate level ROI" });
  }
};

// Fetch Total Investment API
exports.fetchTotalInvestment = async (req, res) => {
  try {
    // Fetch the user based on the ID in the JWT
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Fetch the total active investments for the user (sum of all investments with isActive: true)
    const activeInvestments = await Investment.aggregate([
      { $match: { user: user.id, isActive: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Fetch the total of all investments for the user (this includes inactive ones, if needed)
    const totalInvestment = await Investment.aggregate([
      { $match: { user: user.id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Use the active total by default, or if no active investments, fallback to total investments.
    const totalInvestmentAmount =
      activeInvestments[0]?.total || totalInvestment[0]?.total || 0;

    // Send the total investment as a response
    res.json({
      message: "Total investment fetched successfully",
      totalInvestment: totalInvestmentAmount, // Send the total investment to the frontend
    });
  } catch (error) {
    console.error("Error fetching total investment:", error);
    res.status(500).json({ error: "Failed to fetch total investment" });
  }
};

// Check Rank Qualification
exports.checkRankQualification = async (req, res) => {
  const { totalInvestment } = req.body;

  try {
    // Example rank qualification logic
    const rank = totalInvestment >= 10000 ? "Gold" : "Silver"; // Example logic

    res.json({
      message: `You qualify for the ${rank} rank`,
      rank,
    });
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
