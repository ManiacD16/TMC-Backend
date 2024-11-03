const cron = require('node-cron');
const User = require('../models/User');
const Investment = require('../models/investment');
const { calculateDailyROI, applyTax, calculateCappedROI } = require('../utils/calculations');

// Cron job to run daily at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily ROI calculation...');

  try {
    // Fetch all users
    const users = await User.find();

    for (const user of users) {
      // Get the user's investments
      const investments = await Investment.find({ user: user._id, isCapped: false });

      for (const investment of investments) {
        // Calculate the daily ROI
        let dailyROI = calculateDailyROI(investment.amount);

        // Apply the capping limit to the ROI
        dailyROI = calculateCappedROI(dailyROI);

        // Check if the user's total returns exceed $20,000
        if (user.balance + dailyROI >= 20000) {
          // Apply a 25% tax if returns exceed the threshold
          dailyROI = applyTax(dailyROI);
        }

        // Update the investment with accumulated ROI
        investment.dailyROI += dailyROI;
        investment.daysAccumulated += 1;
        
        // If auto-invest is enabled, reinvest the daily ROI
        if (user.autoInvestEnabled) {
          if (user.investmentTotal + dailyROI <= user.investmentCap) {
            user.investmentTotal += dailyROI;
          } else {
            // If investment cap is reached, stop reinvestment
            investment.isCapped = true;
          }
        } else {
          // If auto-invest is not enabled, add the ROI to the user's balance
          user.balance += dailyROI;
        }

        // Save the updated investment and user data
        await investment.save();
      }

      await user.save();
    }

    console.log('Daily ROI calculation completed successfully.');
  } catch (error) {
    console.error('Error in daily ROI calculation:', error);
  }
});
