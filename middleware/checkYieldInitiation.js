const YieldInvestment = require("../models/YieldInvestment");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const CheckYieldInitiation = async (req, res, next) => {
  try {
    const yieldReq = await YieldInvestment.findOne({
        userId: req.body.userId
    });
    if(yieldReq == null){
        next();
    }
    if (yieldReq.hasInitiated) {
      if (yieldReq.packageType !== req.body.packageType) {
        next();
      }
      else{
        res.status(404).json({
            data: null,
            status: "Package Has Already Been Initited!"
        })
      }
    }
    else{
        next();
    }
  } catch (err) {
    // Handle token expiration error
    if (err) {
      return res.status(401).json({ error: "Yield Query Failed" });
    }

    // General error handling
    console.error("Yield Investment Checking error:", err); // More detailed logging for debugging
    return res
      .status(401)
      .json({ error: "Invalid Request: Invalid Yield Request Submitted" });
  }
};

module.exports =  CheckYieldInitiation ;
