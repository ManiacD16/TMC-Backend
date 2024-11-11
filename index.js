const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session"); // Import express-session
const authRoutes = require("./routes/authRoutes");
const investmentRoutes = require("./routes/investmentRoutes");
const { connectDB } = require("./config/database");
const cookieParser = require("cookie-parser");
require("dotenv").config();
require("./crons/roiCron"); // Import the cron job

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to the database
connectDB();

// Middleware for CORS
// Middleware for CORS
app.use(
  cors({
    origin: ["https://tmc.live", "http://localhost:5173"],
    "Access-Control-Allow-Origin": "*",
    // origin: "http://localhost:5173", // Allow requests from this origin
    credentials: true, // Allow credentials (like cookies)
  })
);

// Middleware for body parsing
app.use(bodyParser.json());
app.use(cookieParser());
// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET, // Use a secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/investments", investmentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
