const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Register
// const User = require("../models/User"); // Assuming you're using a Mongoose model

exports.register = async (req, res) => {
  const { address, password, referralAddress } = req.body;

  if (!address || !password) {
    return res
      .status(400)
      .json({ error: "Wallet address and password are required." });
  }

  try {
    // Check if the user already exists based on the wallet address
    const userExist = await User.findOne({ address });

    if (userExist) {
      return res.status(409).json({ error: "Wallet address already exists" });
    }

    let referrer = null;

    // If there's a referral address, find the referrer user
    if (referralAddress) {
      referrer = await User.findOne({ address: referralAddress });
      if (referrer) {
        referrer.balance += 10; // Example: Give bonus amount to referrer
        await referrer.save();
      } else {
        return res.status(400).json({ error: "Referral address not found" });
      }
    }

    // Create the new user object
    const newUser = new User({
      address,
      password, // Use hashed password here if necessary
      referrer: referrer ? referrer._id : null, // Assign referrer if exists
    });

    await newUser.save(); // Save the new user to the database

    // Respond back with a success message
    res.status(201).json({
      message: "User registered successfully",
      // You may also return a JWT token or authentication token here if needed
      // token: generateAuthToken(newUser),
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// Login
exports.login = async (req, res) => {
  console.log("Signin request body:", req.body);

  try {
    const { address, password } = req.body; // Get the address and password from the request body

    // Check if address and password are provided
    if (!address || !password) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }

    // Find the user by wallet address (instead of email)
    const userLogin = await User.findOne({ address });

    // If user does not exist
    if (!userLogin) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    console.log("User found:", userLogin);

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, userLogin.password);
    console.log("Password match result:", isMatch);
    console.log("Entered password:", password);
    console.log("Stored password:", userLogin.password);

    // If the password does not match
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // Generate token and set cookie if login is successful
    const token = await userLogin.generateAuthToken();
    console.log("Generated token:", token);

    res.cookie("jwtoken", token, {
      expires: new Date(Date.now() + 25892000000), // Cookie expiration (around 30 days)
      httpOnly: true, // Makes the cookie inaccessible to JavaScript
    });

    // Respond with success and send token and user details (wallet address)
    return res.json({
      message: "User signed in successfully.",
      token: token,
      user: { address: userLogin.address }, // Send the wallet address instead of email
    });
  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ error: "Internal Server Error." });
  }
};

// Logout
// Logout
exports.logout = (req, res) => {
  // Optionally, you can check if the token exists
  const token = req.cookies.jwtoken;

  if (!token) {
    return res
      .status(400)
      .json({ error: "No token found, user is already logged out." });
  }

  // Clear the cookie
  // Clear the cookie when logging out
  res.clearCookie("jwtoken", {
    httpOnly: true, // Ensures the cookie is not accessible via JavaScript (for security)
    // secure: process.env.NODE_ENV === "production", // Set to true in production (HTTPS)
    sameSite: "None", // Important for cross-site requests (like for cross-origin logins)
    path: "/", // Clear the cookie for the entire site
  });

  // Optionally, you can also invalidate the JWT on the server side (e.g., blacklist it),
  // but clearing the cookie is generally sufficient for client-side logout.

  return res.json({ message: "Logged out successfully" });
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
    console.error("Fetch user data error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};
