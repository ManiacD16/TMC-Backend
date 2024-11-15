const User = require("../models/User");
require("dotenv").config(); // This loads variables from .env into process.env
const Investment = require("../models/investment");
const YieldInvestment = require("../models/YieldInvestment");
const Withdrawals = require("../models/withdrawals");
const { ethers } = require("ethers");
const { MongoClient, ObjectId } = require("mongodb");
// BSC testnet RPC endpoint
const provider = new ethers.providers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545"
);

// Admin account setup
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
  console.error(
    "Admin private key is not set. Check your .env file or environment variables."
  );
  process.exit(1); // Exit the process if the private key is missing
}

console.log(
  "Admin private key is loaded:",
  adminPrivateKey.length > 0 ? "Valid" : "Invalid"
);

// Create wallet with the private key
const adminWallet = new ethers.Wallet(adminPrivateKey, provider);
console.log("Admin Wallet Address:", adminWallet.address); // Should print the wallet address

const {
  calculateDailyROI,
  calculateYield,
  calculateLiquidityFee,
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
  const { address, password, referralAddress } = req.body;

  if (!address || !password) {
    return res
      .status(400)
      .json({ error: "address and password are required." });
  }

  try {
    const existingUser = await User.findOne({ address });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User already exists with this address." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ address, password: hashedPassword });

    if (referralAddress) {
      const referrer = await User.findOne({ address: referralAddress });
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
  const { address, password } = req.body;

  if (!address || !password) {
    return res
      .status(400)
      .json({ error: "address and password are required." });
  }

  try {
    const user = await User.findOne({ address });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    setTokenCookie(res, token);
    res.json({
      message: "Login successful",
      user: { address: user.address, balance: user.balance },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// Logout by clearing cookie
// exports.logout = (req, res) => {
//   res.clearCookie("token");
//   res.json({ message: "Logged out successfully" });
// };

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
      investment.dailyROI = calculateDailyROI(investment.amount, req.user);
      await investment.save();
    }
    res.json({ message: "Daily ROI updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update daily ROI" });
  }
};

// Withdraw funds for the authenticated user
// exports.withdraw = async (req, res) => {
//   const { amount } = req.body;

//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     if (user.balance < amount) {
//       return res.status(400).json({ error: "Insufficient balance" });
//     }

//     user.balance -= amount;
//     await user.save();

//     res.json({
//       message: "Withdrawal successful",
//       newBalance: user.balance,
//     });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to withdraw funds" });
//   }
// };
// const { ethers } = require("ethers");

exports.withdraw = async (req, res) => {
  const { amount, userAddress } = req.body; // amount to withdraw and user's address

  try {
    // Fetch the user based on the ID in the JWT
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // Check if the user has enough balance to withdraw
    if (req.body.key === "invest_withdraw") {
      if (user.balance < amount) {
        return res
          .status(400)
          .json({ success: false, error: "Insufficient balance." });
      }
    } else if (req.body.key === "yield_withdraw") {
      if (user.yieldBalance < amount) {
        return res
          .status(400)
          .json({ success: false, error: "Insufficient balance." });
      }
    }

    // Define the ERC-20 token contract ABI
    const tokenAbi = [
      "function transfer(address to, uint256 amount) public returns (bool)",
    ];

    // Create an instance of the token contract using ethers.js
    const tokenContract = new ethers.Contract(
      process.env.TOKEN_CONTRACT_ADDRESS, // Replace with actual token contract address
      tokenAbi,
      adminWallet // Signer
    );

    // Convert the amount to the smallest unit (Wei) for the token (adjust decimals as needed)
    const amountInWei = ethers.utils.parseUnits(amount.toString(), 18); // Assuming 18 decimals

    // Deduct the withdrawal amount from the user's balance
    if (req.body.key === "invest_withdraw") {
      user.balance -= amount;
    } else if (req.body.key === "yield_withdraw") {
      user.yieldBalance -= amount;
    }
    await user.save();

    let reqID = new ObjectId();

    // Respond with the updated balance
    res.json({
      Status: "Request Processing...!",
      requestID: String(reqID),
      success: true,
      balance: req.body.key === "invest_withdraw" ? user.balance : user.yieldBalance
    });
    // Execute the transfer
    const tx = await tokenContract.transfer(userAddress, amountInWei);

    // Wait for the transaction to be confirmed
    let confirmation = await tx.wait();
    if(confirmation){
      // Create a new investment record
      
    const w = new Withdrawals({
      userId: user._id,
      requestID: String(reqID),
      amount: Number(amount),
      withdrawalType: req.body.key,
      fundsTransferred: true,
      hasInitiated: true,
      newBalance: req.body.key === "invest_withdraw" ? Number(user.balance) : Number(user.yieldBalance),
      userAddress: userAddress
    });
    console.log("withdrawal ====>>>>>> ", w);
    
    // Save the withdrawal record
    await w.save();
    }
    
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ success: false, error: "Withdrawal failed." });
  }
};

exports.getWithdrawalStatus = async(req, res) =>{
  const {reqID} = req.body;

  try{
    const requestData = await Withdrawals.find({
      requestID: reqID
    });
    res.status(200).json({
      status: "Withdrawal Found!",
      investmentType: requestData[0].withdrawalType,
      fundsTransferredStatus: requestData[0].fundsTransferred
    })
  }
  catch(error){
    res.status(404).json({
      data: null,
      status: "NOT FOUND!"
    })
  }
}

// Invest with Cap Check

exports.invest = async (req, res) => {
  const { amount, packageType } = req.body;

  try {
    // Fetch the user based on the ID in the JWT
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure that the amount is a valid number
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ error: "Investment amount must be a valid number" });
    }

    // Calculate the liquidity fee (1% of the investment amount)
    const liquidityFee = numericAmount * 0.01; // 1% liquidity fee
    const totalAmountRequired = numericAmount + liquidityFee;

    // Ensure the investment amount is within the allowed range
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

    // Save the investment record
    await investment.save();

    // Update the user's total investment (investmentTotal)
    user.investmentTotal += numericAmount; // Ensure it's adding a number
    user.firstInvestment = new Date();
    await user.save();

    // Return the updated total active investment and other details
    res.json({
      message: "Investment successful",
      newActiveInvestmentTotal: user.investmentTotal,
      liquidityFee,
      userInvestmentTotal: user.investmentTotal,
    });
  } catch (error) {
    console.error("Investment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

function checkInitiation(user, next) {
  const userId = req.body.userId;
  if (users[userId] && users[userId].hasInitiated) {
    return res.status(400).json({ error: "Yield package already initiated." });
  }
  next();
}

exports.yieldInvest = async (req, res) => {
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
        .json({ error: "Stake amount must be a valid number" });
    }

    // Check if the investment amount is within the allowed range (before package adjustments)
    if (
      numericAmount === 1000 ||
      numericAmount === 5000 ||
      numericAmount === 10000 ||
      numericAmount === 25000
    ) {
      return res.status(400).json({
        error: "Stake amount must be between $100 and $25,000",
      });
    }

    // Set up the actual investment amounts based on the selected package
    let actualInvestment = 0;
    switch (packageType) {
      case "BASIC":
        actualInvestment = 1000; // Package yields $1,000 actual for $950
        break;
      case "STANDARD":
        actualInvestment = 5000; // Package yields $5,000 actual for $4,500
        break;
      case "PREMIUM":
        actualInvestment = 10000; // Package yields $10,000 actual for $8,500
        break;
      case "ROYAL":
        actualInvestment = 25000; // Package yields $25,000 actual for $20,000
        break;
      default:
        return res.status(400).json({ error: "Invalid package type" });
    }

    // Calculate the liquidity fee (1% of the investment amount)
    const liquidityFee = calculateLiquidityFee(numericAmount);
    const totalAmountRequired = numericAmount + liquidityFee;

    // Create a new investment record
    const investment = new YieldInvestment({
      _id: new ObjectId(),
      dailyROI: 0,
      userId: user._id,
      amount: numericAmount, // The amount user intends to invest
      packageType,
      liquidityFee,
      isActive: true,
      hasInitiated: true,
      daysAccumulated: 0,
      actualInvestment, // Actual investment value based on the package
    });

    // Fetch the updated total active investment for the user
    const activeInvestments = await Investment.aggregate([
      { $match: { user: user.id, isActive: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const activeInvestmentTotal = activeInvestments[0]?.total || 0;
    const newActiveInvestmentTotal = activeInvestmentTotal + numericAmount;

    if (newActiveInvestmentTotal > 25000) {
      return res.status(400).json({
        error: "Total active stake cannot exceed $25,000",
      });
    }

    await investment.save(); // Save the new investment

    // Update the user's total investment (investmentTotal) by adding the current investment amount
    user.investmentTotal += numericAmount; // Ensure it's adding a number
    user.firstInvestment = new Date();
    await user.save(); // Save the updated total investment

    // Return the updated total active investment and other details to the frontend
    res.json({
      message: "Yield Staking successful",
      newActiveInvestmentTotal, // Send the updated total active investment
      liquidityFee,
      actualInvestment, // Send the actual investment value based on the package
      userInvestmentTotal: user.investmentTotal, // Send total investment
    });
  } catch (error) {
    console.error("Staking Error:", error);
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
    console.error("Error fetching staked total:", error);
    res.status(500).json({ error: "Failed to fetch staked total" });
  }
};

// Direct Referral Bonus
exports.directReferralBonus = async (req, res) => {
  const { referralAddress, investmentAmount } = req.body;

  try {
    const referrer = await User.findOne({ address: referralAddress });
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

    const user = req.user;

    // Fetch the user's total investment (sum of all active investments)
    const userInvestments = await Investment.aggregate([
      { $match: { user: user._id, isActive: true } },
      { $group: { _id: user._id, totalAmount: { $sum: "$amount" } } },
    ]);

    if (!userInvestments || userInvestments.length === 0) {
      return res.status(400).json({ error: "No active investment found" });
    }

    const amount = userInvestments[0].totalAmount; // Total active investment amount

    // Function to calculate ROI based on level
    const getLevelROI = (level) => {
      let roiPercentage;
      if (
        user.rank === "TMC PLUS" ||
        user.rank === "TMC PRO" ||
        user.rank === "TMC SMART" ||
        user.rank === "TMC ROYAL" ||
        user.rank === "TMC CHIEF" ||
        user.rank === "TMC AMBASSADOR"
      ) {
        if (level === 1) {
          roiPercentage = 0.1; // 10% ROI for Level 1
        } else if (level === 2) {
          roiPercentage = 0.5; // 50% ROI for Level 2
        } else if (level === 3) {
          roiPercentage = 0.4; // 40% ROI for Level 3
        } else if (level === 4) {
          roiPercentage = 0.3; // 30% ROI for Level 4
        } else if (level === 5) {
          roiPercentage = 0.2; // 20% ROI for Level 5
        } else if (level >= 6 && level <= 150) {
          roiPercentage = 0.02; // 2% ROI for Level 6-150
        }

        return roiPercentage;
      } else {
        if (level === 1) {
          roiPercentage = 0.1; // 10% ROI for Level 1
        } else if (level === 2) {
          roiPercentage = 0.1; // 10% ROI for Level 2
        } else if (level === 3) {
          roiPercentage = 0.1; // 10% ROI for Level 3
        } else if (level === 4) {
          roiPercentage = 0.1; // 10% ROI for Level 4
        } else if (level === 5) {
          roiPercentage = 0.1; // 10% ROI for Level 5
        } else if (level >= 6 && level <= 50) {
          roiPercentage = 0.01; // 1% ROI for Level 6-50
        }
        return roiPercentage;
      }
    };

    // Function to calculate ROI recursively for all levels of referrals
    const calculateReferralROI = async (
      user,
      level,
      amount,
      roiCalculations
    ) => {
      // Fetch the referrals for this user at the given level
      const referrals = await User.find({ referrer: user._id });

      for (const referral of referrals) {
        const roiPercentage = getLevelROI(level); // Get ROI for this level
        const roi = amount * roiPercentage; // Calculate ROI for this referral

        // Save the investment for this referral
        const referralInvestment = new Investment({
          user: referral._id,
          amount,
          roiPercentage,
          roi,
          type: `${level === 1 ? "Direct" : "Indirect"} Referral Level ROI`,
        });
        await referralInvestment.save();

        // Add to ROI calculations
        roiCalculations.push({
          user: referral._id,
          roiPercentage,
          roi,
        });

        // Now, calculate the ROI for this referral's referrals (next level)
        await calculateReferralROI(
          referral,
          level + 1,
          amount,
          roiCalculations
        ); // Recursively calculate for the next level
      }
    };

    // Calculate ROI for direct referrals (Level 1)
    const roiCalculations = [];

    // Call the recursive function starting from the direct referrals (Level 1)
    await calculateReferralROI(user, 1, amount, roiCalculations);

    // Send the response with the calculated ROI for the user and referrals
    res.json({
      message: "ROI calculated successfully based on level and referrals",
      roiCalculations,
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
async function updateDirectConnections() {
  try {
    const users = await User.find({ investmentTotal: { $lt: 500 } }, null, {
      lean: true,
    });

    const bulkOps = [];

    for (const user of users) {
      if (user.referrerId) {
        bulkOps.push({
          updateOne: {
            filter: { _id: user.referrerId },
            update: { $addToSet: { directConnections: user._id } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      const result = await User.bulkWrite(bulkOps);
      console.log(
        `${result.modifiedCount} users' direct connections were updated.`
      );
    } else {
      console.log("No users to update.");
    }
  } catch (error) {
    console.error("Error updating direct connections:", error);
  }
}

const MAX_LEVELS = 50; // Max depth for downline traversal

const rankCriteria = {
  TMC_PLUS: {
    initialDirectConnections: 5, // Initial direct referrals required within the first 30 days
    initialTimeframe: 30, // Timeframe in days for the initial referrals
    nextDirectConnections: 8, // Next direct referrals required within the next 60 days
    nextTimeframe: 60, // Timeframe in days for the next referrals
    finalDirectConnections: 10, // Final direct referrals required within the final 90 days
    finalTimeframe: 90,
  },
  TMC_PRO: {
    requiredTmcPlus: 4, // Minimum number of TMC Plus required
  },
  TMC_SMART: {
    requiredTmcPro: 5, // Minimum number of TMC Pro required
  },
  TMC_ROYAL: {
    requiredTmcSmart: 6, // Minimum number of TMC Smart required
  },
  TMC_CHIEF: {
    requiredTmcRoyal: 7, // Minimum number of TMC Royal required
  },
  TMC_AMBASSADOR: {
    requiredTmcChief: 8, // Minimum number of TMC Chief required
  },
};

// Determine rank based on user data
exports.determineRank = async (req, res) => {
  try {
    await updateDirectConnections();

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If the user has no directConnections, set rank to "Regular"
    if (!user.directConnections || user.directConnections.length === 0) {
      return res.json({ rank: "Regular" });
    }

    const rank = user.rank || "Regular";

    switch (rank) {
      case "Regular":
        return await checkForTmcPlus(user, rankCriteria["TMC_PLUS"], res);
      case "TMC_PLUS":
        return await checkForTmcPro(user, rankCriteria["TMC_PRO"], res);
      case "TMC_PRO":
        return await checkForTmcSmart(user, rankCriteria["TMC_SMART"], res);
      case "TMC_SMART":
        return await checkForTmcRoyal(user, rankCriteria["TMC_ROYAL"], res);
      case "TMC_ROYAL":
        return await checkForTmcChief(user, rankCriteria["TMC_CHIEF"], res);
      case "TMC_CHIEF":
        return await checkForTmcAmbassador(
          user,
          rankCriteria["TMC_AMBASSADOR"],
          res
        );
      default:
        return res.status(400).json({ error: "Rank not recognized" });
    }
  } catch (error) {
    console.error("Error determining rank:", error);
    return res.status(500).json({ error: "Failed to determine rank" });
  }
};

// Check if user qualifies for TMC Plus
function checkForTmcPlus(user, criteria) {
  // Ensure the user object has directConnections and it's an array
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections, firstInvestment } = user;

  // Ensure firstInvestment is a valid date
  if (!firstInvestment || isNaN(new Date(firstInvestment).getTime())) {
    console.error("Invalid firstInvestment date for user:", user._id);
    return "Error: Invalid firstInvestment date.";
  }

  const currentDate = new Date();
  const daysSinceRegistration = Math.floor(
    (currentDate - new Date(firstInvestment)) / (1000 * 60 * 60 * 24)
  );

  console.log(
    `User ${user._id} has been registered for ${daysSinceRegistration} days.`
  );

  // Ensure criteria are valid
  if (
    !criteria ||
    !criteria.initialTimeframe ||
    !criteria.nextTimeframe ||
    !criteria.finalTimeframe
  ) {
    console.error("Invalid criteria for TMC_PLUS:", criteria);
    return "Error: Invalid criteria.";
  }

  // Filter referrals based on their registration date within specific timeframes
  const initialReferrals = directConnections.filter(
    (referral) =>
      daysSinceRegistration <= criteria.initialTimeframe &&
      referral.firstInvestment <= criteria.initialTimeframe
  );

  const nextReferrals = directConnections.filter(
    (referral) =>
      daysSinceRegistration > criteria.initialTimeframe &&
      daysSinceRegistration <=
        criteria.initialTimeframe + criteria.nextTimeframe &&
      referral.firstInvestment <= criteria.nextTimeframe
  );

  const finalReferrals = directConnections.filter(
    (referral) =>
      daysSinceRegistration >
        criteria.initialTimeframe + criteria.nextTimeframe &&
      daysSinceRegistration <=
        criteria.initialTimeframe +
          criteria.nextTimeframe +
          criteria.finalTimeframe &&
      referral.firstInvestment <= criteria.finalTimeframe
  );

  console.log("Initial referrals:", initialReferrals.length);
  console.log("Next referrals:", nextReferrals.length);
  console.log("Final referrals:", finalReferrals.length);

  // Check if the referrals meet the required thresholds for TMC_PLUS
  if (
    initialReferrals.length >= criteria.initialDirectConnections &&
    nextReferrals.length >= criteria.nextDirectConnections &&
    finalReferrals.length >= criteria.finalDirectConnections
  ) {
    return "User qualifies for TMC Plus";
  }

  return "User does not qualify for TMC Plus yet";
}

// Check if user qualifies for TMC Pro
async function checkForTmcPro(user, criteria) {
  // Ensure the user object has directConnections and it's an array
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections } = user;
  let tmcPlusCount = 0;

  // Validate that criteria is correct
  if (!criteria || typeof criteria.requiredTmcPlus !== "number") {
    console.error("Invalid criteria for TMC Pro:", criteria);
    return "Error: Invalid criteria for TMC Pro.";
  }

  console.log(`User ${user._id} is checking for TMC Pro qualification...`);

  // Traverse each direct connection
  for (let i = 0; i < directConnections.length; i++) {
    const direct = directConnections[i];

    // Ensure that direct connection has the rank property
    if (!direct || !direct.rank) {
      console.warn(
        `Direct connection ${direct._id} is missing rank information.`
      );
      continue; // Skip this direct connection if rank is missing
    }

    // Check if the direct connection has the "TMC_PLUS" rank
    if (direct.rank === "TMC_PLUS") {
      tmcPlusCount++;
      console.log(`Direct connection ${direct._id} qualifies for TMC_PLUS.`);
    } else {
      // Traverse the downline for TMC Plus rank (up to MAX_LEVELS deep)
      try {
        const foundInDownline = await checkDownlineForRank(
          direct,
          "TMC_PLUS",
          MAX_LEVELS
        );
        if (foundInDownline) {
          tmcPlusCount++;
          console.log(
            `Downline of direct connection ${direct._id} qualifies for TMC_PLUS.`
          );
        }
      } catch (error) {
        console.error(
          `Error checking downline for TMC_PLUS in direct connection ${direct._id}:`,
          error
        );
        return "Error: Failed to check downline for TMC_PLUS.";
      }
    }
  }

  console.log(`Total TMC_PLUS found: ${tmcPlusCount}`);

  // Check if the user qualifies for TMC Pro based on the required count
  if (tmcPlusCount >= criteria.requiredTmcPlus) {
    return "User qualifies for TMC Pro";
  }

  return "User does not qualify for TMC Pro yet";
}

// Check if user qualifies for TMC Smart
async function checkForTmcSmart(user, criteria) {
  // Ensure user and directConnections are valid
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections } = user;
  let tmcProCount = 0;

  // Validate criteria to ensure requiredTmcPro is a valid number
  if (!criteria || typeof criteria.requiredTmcPro !== "number") {
    console.error("Invalid criteria for TMC Smart:", criteria);
    return "Error: Invalid criteria for TMC Smart.";
  }

  console.log(`User ${user._id} is checking for TMC Smart qualification...`);

  // Traverse each direct connection
  for (let i = 0; i < directConnections.length; i++) {
    const direct = directConnections[i];

    // Ensure direct connection has the rank property
    if (!direct || !direct.rank) {
      console.warn(
        `Direct connection ${direct._id} is missing rank information.`
      );
      continue; // Skip this direct connection if rank is missing
    }

    // Check if the direct connection has the "TMC_PRO" rank
    if (direct.rank === "TMC_PRO") {
      tmcProCount++;
      console.log(`Direct connection ${direct._id} qualifies for TMC_PRO.`);
    } else {
      // Traverse the downline for TMC Pro rank (up to MAX_LEVELS deep)
      try {
        const foundInDownline = await checkDownlineForRank(
          direct,
          "TMC_PRO",
          MAX_LEVELS
        );
        if (foundInDownline) {
          tmcProCount++;
          console.log(
            `Downline of direct connection ${direct._id} qualifies for TMC_PRO.`
          );
        }
      } catch (error) {
        console.error(
          `Error checking downline for TMC_PRO in direct connection ${direct._id}:`,
          error
        );
        return "Error: Failed to check downline for TMC_PRO.";
      }
    }
  }

  console.log(`Total TMC_PRO found: ${tmcProCount}`);

  // Check if the user qualifies for TMC Smart based on the required count
  if (tmcProCount >= criteria.requiredTmcPro) {
    return "User qualifies for TMC Smart";
  }

  return "User does not qualify for TMC Smart yet";
}

// Check if user qualifies for TMC Royal
async function checkForTmcRoyal(user, criteria) {
  // Ensure user and directConnections are valid
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections } = user;
  let tmcSmartCount = 0;

  // Validate criteria to ensure requiredTmcSmart is a valid number
  if (!criteria || typeof criteria.requiredTmcSmart !== "number") {
    console.error("Invalid criteria for TMC Royal:", criteria);
    return "Error: Invalid criteria for TMC Royal.";
  }

  console.log(`User ${user._id} is checking for TMC Royal qualification...`);

  // Traverse each direct connection
  for (let i = 0; i < directConnections.length; i++) {
    const direct = directConnections[i];

    // Ensure direct connection has the rank property
    if (!direct || !direct.rank) {
      console.warn(
        `Direct connection ${direct._id} is missing rank information.`
      );
      continue; // Skip this direct connection if rank is missing
    }

    // Check if the direct connection has the "TMC_SMART" rank
    if (direct.rank === "TMC_SMART") {
      tmcSmartCount++;
      console.log(`Direct connection ${direct._id} qualifies for TMC_SMART.`);
    } else {
      // Traverse the downline for TMC Smart rank (up to MAX_LEVELS deep)
      try {
        const foundInDownline = await checkDownlineForRank(
          direct,
          "TMC_SMART",
          MAX_LEVELS
        );
        if (foundInDownline) {
          tmcSmartCount++;
          console.log(
            `Downline of direct connection ${direct._id} qualifies for TMC_SMART.`
          );
        }
      } catch (error) {
        console.error(
          `Error checking downline for TMC_SMART in direct connection ${direct._id}:`,
          error
        );
        return "Error: Failed to check downline for TMC_SMART.";
      }
    }
  }

  console.log(`Total TMC_SMART found: ${tmcSmartCount}`);

  // Check if the user qualifies for TMC Royal based on the required count
  if (tmcSmartCount >= criteria.requiredTmcSmart) {
    return "User qualifies for TMC Royal";
  }

  return "User does not qualify for TMC Royal yet";
}

// Check if user qualifies for TMC Chief
async function checkForTmcChief(user, criteria) {
  // Ensure user and directConnections are valid
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections } = user;
  let tmcRoyalCount = 0;

  // Validate criteria to ensure requiredTmcRoyal is a valid number
  if (!criteria || typeof criteria.requiredTmcRoyal !== "number") {
    console.error("Invalid criteria for TMC Chief:", criteria);
    return "Error: Invalid criteria for TMC Chief.";
  }

  console.log(`User ${user._id} is checking for TMC Chief qualification...`);

  // Traverse each direct connection
  for (let i = 0; i < directConnections.length; i++) {
    const direct = directConnections[i];

    // Ensure direct connection has the rank property
    if (!direct || !direct.rank) {
      console.warn(
        `Direct connection ${direct._id} is missing rank information.`
      );
      continue; // Skip this direct connection if rank is missing
    }

    // Check if the direct connection has the "TMC_ROYAL" rank
    if (direct.rank === "TMC_ROYAL") {
      tmcRoyalCount++;
      console.log(`Direct connection ${direct._id} qualifies for TMC_ROYAL.`);
    } else {
      // Traverse the downline for TMC Royal rank (up to MAX_LEVELS deep)
      try {
        const foundInDownline = await checkDownlineForRank(
          direct,
          "TMC_ROYAL",
          MAX_LEVELS
        );
        if (foundInDownline) {
          tmcRoyalCount++;
          console.log(
            `Downline of direct connection ${direct._id} qualifies for TMC_ROYAL.`
          );
        }
      } catch (error) {
        console.error(
          `Error checking downline for TMC_ROYAL in direct connection ${direct._id}:`,
          error
        );
        return "Error: Failed to check downline for TMC_ROYAL.";
      }
    }
  }

  console.log(`Total TMC_ROYAL found: ${tmcRoyalCount}`);

  // Check if the user qualifies for TMC Chief based on the required count
  if (tmcRoyalCount >= criteria.requiredTmcRoyal) {
    return "User qualifies for TMC Chief";
  }

  return "User does not qualify for TMC Chief yet";
}

// Check if user qualifies for TMC Ambassador
async function checkForTmcAmbassador(user, criteria) {
  // Ensure user and directConnections are valid
  if (!user || !Array.isArray(user.directConnections)) {
    console.error("Invalid or missing directConnections for user:", user._id);
    return "Error: User directConnections are missing or invalid.";
  }

  const { directConnections } = user;
  let tmcChiefCount = 0;

  // Validate criteria to ensure requiredTmcChief is a valid number
  if (!criteria || typeof criteria.requiredTmcChief !== "number") {
    console.error("Invalid criteria for TMC Ambassador:", criteria);
    return "Error: Invalid criteria for TMC Ambassador.";
  }

  console.log(
    `User ${user._id} is checking for TMC Ambassador qualification...`
  );

  // Traverse each direct connection
  for (let i = 0; i < directConnections.length; i++) {
    const direct = directConnections[i];

    // Ensure direct connection has the rank property
    if (!direct || !direct.rank) {
      console.warn(
        `Direct connection ${direct._id} is missing rank information.`
      );
      continue; // Skip this direct connection if rank is missing
    }

    // Check if the direct connection has the "TMC_CHIEF" rank
    if (direct.rank === "TMC_CHIEF") {
      tmcChiefCount++;
      console.log(`Direct connection ${direct._id} qualifies for TMC_CHIEF.`);
    } else {
      // Traverse the downline for TMC Chief rank (up to MAX_LEVELS deep)
      try {
        const foundInDownline = await checkDownlineForRank(
          direct,
          "TMC_CHIEF",
          MAX_LEVELS
        );
        if (foundInDownline) {
          tmcChiefCount++;
          console.log(
            `Downline of direct connection ${direct._id} qualifies for TMC_CHIEF.`
          );
        }
      } catch (error) {
        console.error(
          `Error checking downline for TMC_CHIEF in direct connection ${direct._id}:`,
          error
        );
        return "Error: Failed to check downline for TMC_CHIEF.";
      }
    }
  }

  console.log(`Total TMC_CHIEF found: ${tmcChiefCount}`);

  // Check if the user qualifies for TMC Ambassador based on the required count
  if (tmcChiefCount >= criteria.requiredTmcChief) {
    return "User qualifies for TMC Ambassador";
  }

  return "User does not qualify for TMC Ambassador yet";
}

// Recursive function to traverse downline and check for a specific rank
async function checkDownlineForRank(direct, targetRank, level) {
  // If we've reached the max depth, stop the recursion
  if (level <= 0) return false;

  // Ensure 'direct' is a valid user object
  if (!direct || !direct._id) {
    console.error("Invalid direct user object:", direct);
    return false;
  }

  // Find downline users based on the referrerId (or equivalent field)
  const downlineUsers = await User.find({ referrerId: direct._id });

  // Traverse through the downline users
  for (const user of downlineUsers) {
    // If we find the target rank, return true
    if (user.rank === targetRank) {
      console.log(`User ${user._id} qualifies for ${targetRank}.`);
      return true;
    }

    // Recursively check this user's downline
    const foundInDownline = await checkDownlineForRank(
      user,
      targetRank,
      level - 1
    );
    if (foundInDownline) return true;
  }

  // If no user with the target rank was found in the downline, return false
  return false;
}

const rankRewards = {
  REGULAR: { reward: 0, flag: "isForRegular" },
  TMC_PLUS: { reward: 500, flag: "isForTmcPlus" },
  TMC_PRO: { reward: 2000, flag: "isForTmcPro" },
  TMC_SMART: { reward: 5000, flag: "isForTmcSmart" },
  TMC_ROYAL: { reward: 50000, flag: "isForTmcRoyal" },
  TMC_CHIEF: { reward: 200000, flag: "isForTmcChief" },
  TMC_AMBASSADOR: { reward: 1000000, flag: "isForTmcAmbassador" },
};

exports.rankReward = async (req, res) => {
  const { user } = req;
  // const { rank } = req.body;

  console.log("user ", user.rank);

  const rewardData = rankRewards[user.rank.toUpperCase()];
  if (!rewardData || user[rewardData.flag]) {
    return res.status(400).json({ error: "Invalid rank or already rewarded" });
  }

  try {
    const updateFields = {
      rankReward: rewardData.reward,
      [rewardData.flag]: true,
    };

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateFields },
      { new: true }
    );

    res.json({
      message: "Rank Reward updated successfully",
      rank: user.rank,
      rankReward: rewardData.reward,
      updatedUser,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update rank" });
  }
};

exports.claimRankReward = async (req, res) => {
  const { user } = req;
  const { rank } = req.body;

  const rewardData = rankRewards[rank];
  if (!rewardData) {
    return res.status(400).json({ error: "Invalid rank specified" });
  }

  if (user[rewardData.flag]) {
    return res
      .status(400)
      .json({ error: "Reward already claimed for this rank" });
  }

  try {
    // Update user's balance and set the rank flag
    const updateFields = {
      balance: (user.balance || 0) + rewardData.reward,
      rankReward: (user.rankReward || 0) + rewardData.reward,
      [rewardData.flag]: true,
    };

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateFields },
      { new: true }
    );

    // Get the reward status of all ranks
    const rewardStatus = Object.entries(rankRewards).map(([rank, data]) => ({
      rank,
      reward: data.reward,
      claimed: !!updatedUser[data.flag],
    }));

    res.status(200).json({
      message: "Rank reward claimed successfully",
      claimedReward: rewardData.reward,
      totalRankReward: updatedUser.rankReward,
      updatedBalance: updatedUser.balance,
      rewardsStatus: rewardStatus,
    });
  } catch (error) {
    console.error("Error claiming rank reward:", error);
    res.status(500).json({ error: "Failed to claim rank reward" });
  }
};

exports.getUserBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // Fetch user from JWT
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ balance: user.balance });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Error fetching balance" });
  }
};

exports.getyieldBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // Fetch user from JWT
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ balance: user.yieldBalance });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Error fetching balance" });
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
