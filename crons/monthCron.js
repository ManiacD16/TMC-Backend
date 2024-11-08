const cron = require("node-cron");
const User = require("../models/User");

cron.schedule("0 0 1 * *", async () => {
  // Run this cron job on the 1st day of every month
  console.log("Running monthly rank rewards...");

  try {
    // Fetch all users
    const users = await User.find();

    for (const user of users) {
      let monthlyRankReward = 0;
      let updateFields = {};
      const currentTime = Date.now();
      if (!user.address) {
        console.warn(
          `User ${user._id} is missing an address field, skipping ROI calculation for this user.`
        );
        continue; // Skip the user if the address is missing
      }

      // Define the reward and the flag for each tier
      if (user.rank === "TMC SMART" && !user.isForMonthlyTier1) {
        monthlyRankReward = 1000;
        updateFields = {
          balance: (user.balance || 0) + monthlyRankReward,
          monthlyRankReward,
          tier1StartDate: currentTime, // Save the start date for tier 1
          isForMonthlyTier1: true,
        };
      } else if (user.rank === "TMC ROYAL" && !user.isForMonthlyTier2) {
        monthlyRankReward = 5000;
        updateFields = {
          balance: (user.balance || 0) + monthlyRankReward,
          monthlyRankReward,
          tier2StartDate: currentTime, // Save the start date for tier 2
          isForMonthlyTier2: true,
        };
      } else if (user.rank === "TMC CHIEF" && !user.isForMonthlyTier3) {
        monthlyRankReward = 10000;
        updateFields = {
          balance: (user.balance || 0) + monthlyRankReward,
          monthlyRankReward,
          tier3StartDate: currentTime, // Save the start date for tier 3
          isForMonthlyTier3: true,
        };
      } else if (user.rank === "TMC AMBASSADOR" && !user.isForMonthlyTier4) {
        monthlyRankReward = 30000;
        updateFields = {
          balance: (user.balance || 0) + monthlyRankReward,
          monthlyRankReward,
          tier4StartDate: currentTime, // Save the start date for tier 4
          isForMonthlyTier4: true,
        };
      }

      // Check and update monthly rewards if tier has been reached
      const checkAndAddMonthlyReward = (tierStartDate, rewardAmount, flag) => {
        const monthDifference = Math.floor(
          (currentTime - tierStartDate) / (30 * 24 * 60 * 60 * 1000)
        ); // Calculate month difference
        if (monthDifference >= 1 && !user[flag]) {
          // If at least one month has passed since the start date
          updateFields.balance = (user.balance || 0) + rewardAmount; // Add the monthly reward to balance
          updateFields[flag] = true; // Set the flag to indicate reward has been added this month
        }
      };

      // Check and add monthly rewards based on the tier
      if (user.isForMonthlyTier1)
        checkAndAddMonthlyReward(
          user.tier1StartDate,
          1000,
          "isForTmcSmartRewardClaimed"
        );
      if (user.isForMonthlyTier2)
        checkAndAddMonthlyReward(
          user.tier2StartDate,
          5000,
          "isForTmcRoyalRewardClaimed"
        );
      if (user.isForMonthlyTier3)
        checkAndAddMonthlyReward(
          user.tier3StartDate,
          10000,
          "isForTmcChiefRewardClaimed"
        );
      if (user.isForMonthlyTier4)
        checkAndAddMonthlyReward(
          user.tier4StartDate,
          30000,
          "isForTmcAmbassadorRewardClaimed"
        );

      // If updates are made, save the user data
      if (Object.keys(updateFields).length > 0) {
        await User.findByIdAndUpdate(
          user._id,
          { $set: updateFields },
          { new: true }
        );
      }
    }

    console.log("Monthly rank rewards processed successfully.");
  } catch (error) {
    console.error("Error processing monthly rank rewards:", error);
  }
});
