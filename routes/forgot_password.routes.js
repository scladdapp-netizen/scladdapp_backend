const express = require("express");
const crypto  = require("crypto");
const User    = require("../models/User.model");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const { sendEmailFromTemplate } = require("../utils/sendEmail");

const router = express.Router();

// POST /forgot-password
router.post("/", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) return res.status(404).json({ success: false, message: "User does not exist." });

    // Invalidate any existing unused tokens for this user
    await PasswordResetToken.updateMany(
      { user_id: user.reference_id, used: false },
      { $set: { used: true } }
    );

    // Generate reset token (expires in 1h)
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordResetToken.create({
      token,
      user_id:    user.reference_id,
      user_type:  user.user_type,
      email:      user.email,
      expires_at: expiresAt,
      purpose:    "reset",
    });

    const resetUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    await sendEmailFromTemplate(
      "forgot_password",
      { resetUrl },
      { to: user.email, displayName: "ScladApp_Security" }
    );

    return res.json({ success: true, message: "Password reset link sent to your email." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

module.exports = router;
