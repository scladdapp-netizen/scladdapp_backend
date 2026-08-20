const express = require("express");
const multer = require("multer");
const { signup, login } = require("../controllers/auth.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const User = require("../models/User.model");
const { sendEmailFromTemplate } = require("../utils/sendEmail");

const router = express.Router();

// Use memory storage so we get a buffer to upload to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// In-memory OTP store for setup flow: { email -> { otp, expiresAt } }
const setupOtpStore = new Map();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /setup/send-otp ──────────────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const otp       = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    setupOtpStore.set(email.toLowerCase().trim(), { otp, expiresAt });

    await sendEmailFromTemplate(
      "otp",
      { otp },
      { to: email, displayName: "ScladApp" }
    );

    return res.json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("Setup OTP send error:", err);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// ── POST /setup/verify-otp ────────────────────────────────────────────────────
router.post("/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP are required." });

    const key    = email.toLowerCase().trim();
    const record = setupOtpStore.get(key);

    if (!record) return res.status(400).json({ success: false, message: "No OTP found. Please request a new one." });
    if (Date.now() > record.expiresAt) {
      setupOtpStore.delete(key);
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp !== otp.toString()) {
      return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
    }

    setupOtpStore.delete(key);
    return res.json({ success: true, message: "Email verified." });
  } catch (err) {
    console.error("Setup OTP verify error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

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
