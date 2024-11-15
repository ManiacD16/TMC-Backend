// utils/calculator.js

function calculateDailyROI(amount, user) {
  if (user.rank === "TMC PLUS" ){
    return amount * 0.008;
  }
  else if (user.rank === "TMC PRO" || user.rank === "TMC SMART" || user.rank === "TMC ROYAL" || user.rank === "TMC CHIEF" || user.rank === "TMC AMBASSADOR") {
    return amount * 0.01;
  }
  else {
    return amount * 0.006;
  }
}

function applyTax(amount, taxRate = 0.25) {
  return amount * (1 - taxRate);
}

function checkInvestmentCap(
  currentInvestment,
  newInvestment,
  investmentCap = 10000
) {
  return currentInvestment + newInvestment <= investmentCap;
}

function calculateCappedROI(dailyROI, dailyCap = 20000) {
  return Math.min(dailyROI, dailyCap);
}

// New function to calculate liquidity fee (1% of the investment amount)
function calculateLiquidityFee(amount) {
  return amount * 0.01; // 1% fee
}

// Calculate yield based on the investment amount
function calculateYield(amount) {
  // Example logic: 10% yield for investments greater than $1000
  if (amount > 1000) {
    return amount * 0.1; // 10% yield
  }
  return 0; // No yield for smaller investments
}

function calculateLevelROI(level, directReferrals, amount) {
  let roiPercentage = 0;

  // Define ROI logic based on level and direct referrals
  if (directReferrals < 5) {
    roiPercentage = level <= 5 ? 0.1 : 0.01;
  } else {
    roiPercentage = level === 1 ? 0.1 : level <= 5 ? 0.5 : 0.02;
  }

  const roi = amount * roiPercentage;

  return { percentage: roiPercentage, value: roi };
}

module.exports = {
  calculateDailyROI,
  applyTax,
  checkInvestmentCap,
  calculateCappedROI,
  calculateLiquidityFee,
  calculateYield,
  calculateLevelROI, // Export the new function
};
