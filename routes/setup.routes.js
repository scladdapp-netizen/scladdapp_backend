const express = require("express");
const multer = require("multer");
const { signup, login } = require("../controllers/auth.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const User = require("../models/User.model");

const router = express.Router();

// Use memory storage so we get a buffer to upload to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// Check if admin email already exists
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(200).json({ success: true, exists: true, message: "This email is already registered" });
    }
    return res.status(200).json({ success: true, exists: false });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

router.post("/complete", upload.single("school_logo"), async (req, res) => {
  try {
    // Fields come as strings in multipart/form-data — parse the JSON fields
    const adminData = JSON.parse(req.body.adminData);
    const schoolData = JSON.parse(req.body.schoolData);
    const totalMonths = Number(req.body.totalMonths);
    const selectedPlan = JSON.parse(req.body.selectedPlan);
    const billingCycle = req.body.billingCycle;
    const total_amount = req.body.total_amount;
    const duration = req.body.duration;
    const agreeTerms = req.body.agreeTerms === "true";

    if (!adminData || !schoolData) {
      return res.status(400).json({ success: false, message: "Admin data and school data are required" });
    }
    if (!agreeTerms) {
      return res.status(400).json({ success: false, message: "You must agree to the terms and conditions" });
    }

    // Upload logo to Cloudinary if a file was provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "scladapp/school_logos");
      schoolData.school_logo = result.url;
    } else {
      schoolData.school_logo = null;
    }

    const subscriptionData = { plan: selectedPlan, billingCycle, totalMonths, duration, totalAmount: total_amount };

    // Signup
    const signupResult = await signup(adminData, schoolData, subscriptionData);
    if (!signupResult.success) return res.status(400).json(signupResult);

    // Auto-login
    const loginResult = await login(adminData.adminEmail, adminData.adminPassword);
    if (!loginResult.success) {
      return res.status(500).json({ success: false, message: "Signup succeeded but login failed" });
    }

    return res.status(201).json({ success: true, data: loginResult.data, message: "School setup completed successfully" });

  } catch (error) {
    console.error("Setup error:", error);
    return res.status(500).json({ success: false, message: error.message || "An unexpected error occurred" });
  }
});

module.exports = router;
