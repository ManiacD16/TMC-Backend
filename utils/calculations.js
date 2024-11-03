function calculateDailyROI(amount, dailyRate = 0.005) {
    return amount * dailyRate;
  }
  
  function applyTax(amount, taxRate = 0.25) {
    return amount * (1 - taxRate);
  }
  
  function checkInvestmentCap(currentInvestment, newInvestment, investmentCap = 10000) {
    return (currentInvestment + newInvestment) <= investmentCap;
  }
  
  function calculateCappedROI(dailyROI, dailyCap = 20000) {
    return Math.min(dailyROI, dailyCap);
  }
  
  module.exports = {
    calculateDailyROI,
    applyTax,
    checkInvestmentCap,
    calculateCappedROI
  };
  