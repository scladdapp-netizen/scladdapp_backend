const express = require("express");
const crypto  = require("crypto");
const User    = require("../models/User.model");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const { sendEmail } = require("../utils/sendEmail");

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
    });

    const resetUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    await sendEmail({
      to:      user.email,
      subject: "ScladApp — Reset your password",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Reset Password — ScladApp</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 20px}
.wrap{max-width:520px;margin:0 auto;position:relative}
.wrap::before{content:"";position:absolute;width:160px;height:160px;border-radius:50%;border:20px solid rgba(0,0,0,0.04);top:-50px;right:-40px;pointer-events:none}
.wrap::after{content:"";position:absolute;width:60px;height:60px;border-radius:10px;border:2px solid rgba(0,0,0,0.05);bottom:20px;right:50px;transform:rotate(22deg);pointer-events:none}
.dc{position:absolute;width:100px;height:100px;border-radius:50%;border:12px solid rgba(0,0,0,0.03);bottom:-30px;left:-20px;pointer-events:none}
.card{position:relative;z-index:1;background:#fff;border-radius:16px;padding:40px 36px;border:1px solid #e8e8e8;overflow:hidden}
.card::before{content:"";position:absolute;width:110px;height:110px;border-radius:50%;border:14px solid rgba(0,0,0,0.03);top:-35px;right:-25px;pointer-events:none}
.icon-wrap{width:48px;height:48px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
h1{font-size:22px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1.15;margin-bottom:12px}
p{font-size:14px;color:#666;line-height:1.6;margin-bottom:0}
.btn-wrap{margin:28px 0}
.btn{display:inline-block;padding:13px 32px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.divider{height:1px;background:#e8e8e8;margin:24px 0}
.note{font-size:12px;color:#bbb;line-height:1.5}
</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <div class="card">
    <div class="icon-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <div class="brand">ScladApp</div>
    <h1>Reset your password</h1>
    <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn">Reset My Password &rarr;</a>
    </div>
    <div class="divider"></div>
    <p class="note">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
  </div>
</div>
</body>
</html>`,
    });

    return res.json({ success: true, message: "Password reset link sent to your email." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

module.exports = router;
