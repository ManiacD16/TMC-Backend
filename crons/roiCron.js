const cron = require("node-cron");
const User = require("../models/User");
const Investment = require("../models/investment");
const YieldInvestment = require("../models/YieldInvestment");
const {
  calculateDailyROI,
  applyTax,
  calculateCappedROI,
} = require("../utils/calculations");

// Cron job to run every 20 minutes (for testing purposes)
cron.schedule("*/20 * * * *", async () => {
  console.log(
    "Running daily ROI calculation (every 20 minutes for testing)..."
  );

  try {
    // Fetch all users
    const users = await User.find();

    for (const user of users) {
      // Check if address is missing (validation step)
      if (!user.address) {
        console.error(
          `User ${user._id} is missing an address. Skipping ROI calculation.`
        );
        continue; // Skip this user if address is required
      }

      // Get the user's investments
      const investments = await Investment.find({
        user: user._id,
        isCapped: false,
      });

      const yieldInvestments = await YieldInvestment.find({
        userId: user._id
      });

      for (const investment of yieldInvestments) {
        console.log("Yield Investments CRON ====>>>>");
        // Calculate the daily ROI
        let dailyROI = calculateDailyROI(investment.amount);

        // Apply the capping limit to the ROI
        dailyROI = calculateCappedROI(dailyROI);

        // Check if the user's total returns exceed $20,000
        if (user.yieldBalance + dailyROI >= 50000) {
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
          user.yieldBalance += dailyROI;
        }

        // Save the updated investment and user data
        await investment.save();
      }

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

      // Only save the user if address is valid (prevent validation error)
      await user.save();
    }

    console.log("Daily ROI calculation completed successfully (testing mode).");
  } catch (error) {
    console.error("Error in daily ROI calculation:", error);
  }
});
