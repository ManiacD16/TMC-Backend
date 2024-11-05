const jwt = require("jsonwebtoken");
const User = require("../models/User");

const Authenticate = async (req, res, next) => {
  try {
    // Get the token from the cookies (or headers if you prefer).
    const token =
      req.cookies.jwtoken ||
      req.header("Authorization")?.replace("Bearer ", "");

    // If no token is found in the cookies or Authorization header
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    // Check if the JWT_SECRET environment variable is set
    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ error: "Internal Server Error: JWT_SECRET not defined" });
    }

    // Verify the token using the JWT secret
    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user associated with the token
    const rootUser = await User.findOne({
      _id: verifyToken._id,
      "tokens.token": token,
    });

    // If no user is found or the token is invalid
    if (!rootUser) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    // Attach token and user information to the request object
    req.token = token;
    req.rootUser = rootUser;
    req.userID = rootUser._id;

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    // Handle token expiration error
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Unauthorized: Token has expired" });
    }

    // General error handling
    console.error("Authentication error:", err); // More detailed logging for debugging
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

module.exports = Authenticate;
