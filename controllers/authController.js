const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Register
exports.register = async (req, res) => {
  const { email, password, referralEmail } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    // Check if the user already exists
    const userExist = await User.findOne({ email });

    if (userExist) {
      return res.status(409).json({ error: "Email already exists" });
    }

    let referrer = null;

    // If there's a referral email, find the referrer user
    if (referralEmail) {
      referrer = await User.findOne({ email: referralEmail });
      if (referrer) {
        referrer.balance += 10; // Example: Give bonus amount to referrer
        await referrer.save();
      } else {
        return res.status(400).json({ error: "Referral email not found" });
      }
    }

    // Now create the user object and hash the password if necessary
    // const hashedPassword = await bcrypt.hash(password, 10); // Uncomment if you are hashing the password
    const newUser = new User({
      email,
      password, // Use hashed password here
      referrer: referrer ? referrer._id : null, // Assign referrer if exists
    });

    await newUser.save(); // Save the new user to the database

    // Respond back with a success message
    res.status(201).json({
      message: "User registered successfully",
      // Optionally, you can also send back the user's details or token
      // token: generateAuthToken(newUser), // Make sure you generate a JWT token or any auth token here
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
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }

    // Find the user by email
    const userLogin = await User.findOne({ email });
    console.log("User found:", userLogin);

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
      expires: new Date(Date.now() + 25892000000),
      httpOnly: true,
    });

    return res.json({
      message: "User signed in successfully.",
      token: token,
      user: { email: userLogin.email },
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
  res.clearCookie("jwtoken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
