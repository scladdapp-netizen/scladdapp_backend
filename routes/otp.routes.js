const express = require("express");
const User    = require("../models/User.model");
const { sendEmail } = require("../utils/sendEmail");

const router = express.Router();

// In-memory OTP store: { email -> { otp, expiresAt } }
// For production, replace with Redis or a DB collection
const otpStore = new Map();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /api/otp/send ────────────────────────────────────────────────────────
// Body: { email }
// Generates a 6-digit OTP, stores it for 10 minutes, sends it to the user's email
router.post("/send", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return success anyway to avoid email enumeration
      return res.json({ success: true, message: "If that email exists, an OTP has been sent." });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is deactivated." });
    }

    const otp       = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email.toLowerCase().trim(), { otp, expiresAt });

    await sendEmail({
      to:      user.email,
      subject: "ScladApp — Your login verification code",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your OTP — ScladApp</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 20px}
.wrap{max-width:520px;margin:0 auto;position:relative}
.wrap::before{content:"";position:absolute;width:160px;height:160px;border-radius:50%;border:20px solid rgba(0,0,0,0.04);top:-50px;right:-40px;pointer-events:none}
.dc{position:absolute;width:100px;height:100px;border-radius:50%;border:12px solid rgba(0,0,0,0.03);bottom:-30px;left:-20px;pointer-events:none}
.card{position:relative;z-index:1;background:#fff;border-radius:16px;padding:40px 36px;border:1px solid #e8e8e8;overflow:hidden}
.card::before{content:"";position:absolute;width:110px;height:110px;border-radius:50%;border:14px solid rgba(0,0,0,0.03);top:-35px;right:-25px;pointer-events:none}
.icon-wrap{width:48px;height:48px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
h1{font-size:22px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1.15;margin-bottom:12px}
p{font-size:14px;color:#666;line-height:1.6;margin-bottom:16px}
.otp-box{background:#f5f5f5;border:1.5px solid #e8e8e8;border-radius:12px;padding:20px;text-align:center;margin:24px 0}
.otp-code{font-size:36px;font-weight:900;letter-spacing:10px;color:#111;font-family:monospace}
.otp-exp{font-size:12px;color:#aaa;margin-top:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.divider{height:1px;background:#e8e8e8;margin:24px 0}
.note{font-size:12px;color:#bbb;line-height:1.5}
</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <div class="card">
    <div class="icon-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
    </div>
    <div class="brand">ScladApp</div>
    <h1>Your verification code</h1>
    <p>Use the code below to complete your login. It expires in <strong>10 minutes</strong>.</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-exp">Expires in 10 minutes</div>
    </div>
    <div class="divider"></div>
    <p class="note">If you didn't request this code, someone may be trying to access your account. You can safely ignore this email — your account is still secure.</p>
  </div>
</div>
</body>
</html>`,
    });

    return res.json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("OTP send error:", err);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// ── POST /api/otp/verify ──────────────────────────────────────────────────────
// Body: { email, otp }
// Verifies the OTP and removes it from the store on success
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

    // Valid — remove from store
    otpStore.delete(key);

    return res.json({ success: true, message: "OTP verified." });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
