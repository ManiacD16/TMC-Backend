const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Register
exports.register = async (req, res) => {
  console.log("Register function called with:", req.body);
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    const errorMessage = "Validation error: Email and password are required.";
    console.error(errorMessage);
    return res.status(400).json({ error: errorMessage });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const errorMessage = `User already exists with this email: ${email}`;
      console.warn(errorMessage);
      return res.status(409).json({ error: errorMessage });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully.");

    // Create a new user
    const user = new User({ email, password: hashedPassword });
    await user.save();
    console.log("User registered successfully:", user);

    // Respond with success
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error); // Log error details
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// Login
exports.login = async (req, res) => {
  console.log("Login function called with:", req.body);
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    const errorMessage = "Validation error: Email and password are required.";
    console.error(errorMessage);
    return res.status(400).json({ error: errorMessage });
  }

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      const errorMessage = `Invalid credentials for email: ${email}`;
      console.warn(errorMessage);
      return res.status(401).json({ error: errorMessage });
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const errorMessage = `Invalid password attempt for email: ${email}`;
      console.warn(errorMessage);
      return res.status(401).json({ error: errorMessage });
    }

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    console.log("JWT token created successfully for user:", user.email);

    // Respond with the token and user details
    res.json({ token, user: { email: user.email, balance: user.balance } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// Logout
exports.logout = (req, res) => {
  console.log("Session:", req.session); // Log session information
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error during logout:", err);
        return res
          .status(500)
          .json({ message: "Logout failed. Please try again later." });
      }
      return res.json({ message: "Logged out successfully" });
    });
  } else {
    console.log("No session found");
    return res.status(403).json({ message: "No session to log out from" });
  }
};

// Fetch User Data
exports.fetchUserData = async (req, res) => {
  console.log("Fetch user data function called for user ID:", req.user.id);
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      const errorMessage = `User not found with ID: ${req.user.id}`;
      console.warn(errorMessage);
      return res.status(404).json({ error: errorMessage });
    }
    console.log("User data fetched successfully:", user);
    res.json(user);
  } catch (error) {
    console.error("Failed to fetch user data:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};
