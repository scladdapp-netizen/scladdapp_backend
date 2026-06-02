const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User.model");
const Admin = require("../models/Admin.model");
const Staff = require("../models/Staff.model");
const Student = require("../models/Student.model");
const School = require("../models/School.model");
const Subscription = require("../models/Subscription.model");
const Plan = require("../models/Plan.model");
const { logActivity } = require("../controllers/staff_activity.controller");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    // Step 1: Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect" });
    }

    // Step 2: Compare password (all types store hashed password in User)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect" });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Your account has been deactivated" });
    }

    // Step 3: Get profile based on user_type
    let profile = null;
    let userData = {};

    if (user.user_type === "admin") {
      profile = await Admin.findOne({ admin_id: user.reference_id });
      if (!profile) return res.status(404).json({ success: false, message: "Admin profile not found" });
      if (!profile.is_active) return res.status(403).json({ success: false, message: "Account deactivated" });

      const { password: _pw, ...adminClean } = profile.toObject();
      userData = { admin: adminClean };

    } else if (user.user_type === "staff" || user.user_type === "teacher") {
      profile = await Staff.findOne({ staff_id: user.reference_id });
      if (!profile) return res.status(404).json({ success: false, message: "Staff profile not found" });
      if (!profile.is_active) return res.status(403).json({ success: false, message: "Account deactivated" });

      const { created_by: _cb, ...staffClean } = profile.toObject();
      userData = { staff: staffClean };

      // Check if staff also has admin role
      const adminRole = await Admin.findOne({ staff_id: user.reference_id, is_active: true });
      if (adminRole) {
        const { password: _pw, ...adminClean } = adminRole.toObject();
        userData.admin = adminClean;
        userData.has_multiple_roles = true;
      }

    } else if (user.user_type === "student") {
      profile = await Student.findOne({ student_id: user.reference_id });
      if (!profile) return res.status(404).json({ success: false, message: "Student profile not found" });
      if (!profile.is_active) return res.status(403).json({ success: false, message: "Account deactivated" });

      const { created_by: _cb, ...studentClean } = profile.toObject();
      userData = { student: studentClean };

    } else {
      return res.status(400).json({ success: false, message: "Unknown user type" });
    }

    // Step 4: Get school
    const school = await School.findOne({ school_id: profile.school_id });
    if (!school) return res.status(404).json({ success: false, message: "School not found" });

    // Step 5: Get subscription
    const allSubs = await Subscription.find({ school_id: profile.school_id }).sort({ end_date: -1 });
    const subscription = allSubs.find(
      (s) => s.subscription_status === "active" || s.subscription_status === "trialing"
    ) || allSubs[0] || null;

    // Enrich subscription with plan features
    let subscriptionData = subscription ? subscription.toObject() : null;
    if (subscriptionData) {
      const plan = await Plan.findOne({ plan_id: String(subscriptionData.plan_id) });
      subscriptionData.plan_features = plan?.features || [];
      subscriptionData.plan_name = plan?.plan_name || null;
    }

    // Step 6: Sign JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        user_type: user.user_type,
        reference_id: user.reference_id,
        school_id: profile.school_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Step 7: Log activity for admin/staff
    if (user.user_type !== "student") {
      const actorId = userData.admin?.admin_id || userData.staff?.staff_id || user.user_id;
      const actorName = userData.admin?.username || userData.staff?.full_name || email;
      const staffType = userData.admin ? "admin" : "staff";
      logActivity(actorId, profile.school_id, "LOGIN", "Authentication", `${actorName} logged in`, "success", staffType);
    }

    return res.status(200).json({
      success: true,
      data: {
        token,
        ...userData,
        user_id: user.user_id,
        school: school.toObject(),
        subscription: subscriptionData,
      },
      message: "Login successful",
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

module.exports = router;
