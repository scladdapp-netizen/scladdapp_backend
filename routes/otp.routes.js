const express = require("express");
const User    = require("../models/User.model");
const { sendEmailFromTemplate } = require("../utils/sendEmail");

const router = express.Router();

// In-memory OTP store: { email -> { otp, expiresAt } }
const otpStore = new Map();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /api/otp/send ────────────────────────────────────────────────────────
// Body: { email, schoolId? }
router.post("/send", async (req, res) => {
  try {
    const { email, schoolId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Avoid email enumeration — always return success
      return res.json({ success: true, message: "If that email exists, an OTP has been sent." });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is deactivated." });
    }

    const otp       = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email.toLowerCase().trim(), { otp, expiresAt });

    // Send OTP email using the "otp" template (displayName: "OTP")
    await sendEmailFromTemplate(
      "otp",
      { otp },
      { to: email, schoolId: schoolId || null, displayName: "ScladApp_OTP" }
    );

    return res.json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("OTP send error:", err);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// ── POST /api/otp/verify ──────────────────────────────────────────────────────
// Body: { email, otp }
router.post("/verify", (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required." });
    }

    const key    = email.toLowerCase().trim();
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({ success: false, message: "No OTP found. Please request a new one." });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    if (record.otp !== otp.toString()) {
      return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
    }

    otpStore.delete(key);
    return res.json({ success: true, message: "OTP verified." });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
