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
    const userExist = await User.findOne({ email });

    if (userExist) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // const hashedPassword = await bcrypt.hash(password, 10);
    // const user = new User({ email, password: hashedPassword });

    if (referralEmail) {
      const referrer = await User.findOne({ email: referralEmail });
      if (referrer) {
        referrer.balance += 10; // Example bonus amount; adjust as needed
        await referrer.save();
        user.referrer = referrer._id;
      }
    }

    const user = new User({
      email,
      password,
      //   : hashedPassword
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
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
exports.logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
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
