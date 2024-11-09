const express = require("express");
const {
  fetchDailyROI,
  updateDailyROI,
  withdraw,
  invest,
  directReferralBonus,
  checkYieldPackageEligibility,
  calculateLevelROI, // <-- This should be imported
  rankReward,
  calculateDailyCapping,
  getUserInvestmentTotal,
  yieldInvest,
  determineRank,
  getUserBalance,
} = require("../controllers/investmentController");
const router = express.Router();
const auth = require("../middleware/auth");

// Route to fetch daily ROI for the authenticated user
router.get("/daily-roi", auth, fetchDailyROI);

// Route to update daily ROI for the authenticated user
router.post("/update-daily-roi", auth, updateDailyROI);

// Route to withdraw funds for the authenticated user
router.post("/withdraw", auth, withdraw);

// Route to invest an amount for the authenticated user
router.post("/invest", auth, invest);

// Route to credit a direct referral bonus
router.post("/direct-referral-bonus", auth, directReferralBonus);

// Route to check eligibility for yield packages
router.post("/check-yield-package", auth, checkYieldPackageEligibility);

// Route to calculate ROI based on referral levels
router.get("/calculate-level-roi", auth, calculateLevelROI);

// Route to fetch total investment for the authenticated user
router.get("/total-investment", auth, getUserInvestmentTotal);

// Fetch user balance
router.get("/balance", auth, getUserBalance);

// Route to check rankReward
router.get("/rank-reward", auth, rankReward);

// Route to calculate daily capping for returns
router.post("/calculate-daily-capping", auth, calculateDailyCapping);
// Route to buy yield packages
router.post("/buy-yield-package", auth, yieldInvest);
// calculatr rank qualification
router.get("/determineRank", auth, determineRank);
// router.get("/api/determineRank", determineRank);
module.exports = router;
