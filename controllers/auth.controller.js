const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User.model");
const Admin = require("../models/Admin.model");
const School = require("../models/School.model");
const Subscription = require("../models/Subscription.model");
const Payment = require("../models/Payment.model");

// ─── SIGNUP ──────────────────────────────────────────────────────────────────
const signup = async (adminData, schoolData, subscriptionData) => {
  try {
    // Step 1: Create School
    const newSchool = await School.create({
      school_id: Date.now().toString(),
      school_name: schoolData.school_name,
      motto: schoolData.school_slogan,
      country: schoolData.school_country,
      state: schoolData.school_state,
      address: schoolData.school_address,
      phone_number: schoolData.school_phone,
      email: schoolData.school_email,
      logo_url: schoolData.school_logo,
      is_active: true,
    });

    // Step 2: Create Admin (no password stored here)
    const newAdmin = await Admin.create({
      admin_id: (Date.now() + 1).toString(),
      staff_id: null,
      school_id: newSchool.school_id,
      username: adminData.adminUsername,
      email: adminData.adminEmail,
      admin_role: "Super Admin",
      access_scope: "full",
      permissions: ["ALL"],
      is_active: true,
      assigned_by: null,
      two_fac_auth: true,
    });

    // Step 3: Hash password and create User
    const hashedPassword = await bcrypt.hash(adminData.adminPassword, 10);

    const newUser = await User.create({
      user_id: (Date.now() + 10).toString(),
      user_type: "admin",
      reference_id: newAdmin.admin_id,
      email: adminData.adminEmail,
      password: hashedPassword,
      is_active: true,
    });

    // Step 4: Calculate subscription dates
    const totalMonths = subscriptionData.totalMonths;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + totalMonths);

    // Step 5: Create Subscription
    const newSubscription = await Subscription.create({
      subscription_id: (Date.now() + 2).toString(),
      school_id: newSchool.school_id,
      plan_id: subscriptionData.plan["$id"],
      subscription_type: subscriptionData.plan.plan_type.toLowerCase(),
      subscription_status: "active",
      start_date: startDate,
      end_date: endDate,
      canceled_at: null,
    });

    // Step 6: Create Payment
    const planType = subscriptionData.plan.plan_type.toLowerCase();
    let amountPaid = 0;
    if (planType === "paid") {
      const cycle = subscriptionData.billingCycle;
      if (cycle === "monthly") amountPaid = subscriptionData.plan.monthly_price || 0;
      else if (cycle === "quarterly") amountPaid = subscriptionData.plan.quataly_price || 0;
      else if (cycle === "yearly") amountPaid = subscriptionData.plan.yearly_price || 0;
    }
    const totalAmount = subscriptionData.totalAmount
      ? parseFloat(subscriptionData.totalAmount.toString().replace(/,/g, ""))
      : amountPaid;

    await Payment.create({
      payment_id: (Date.now() + 3).toString(),
      subscription_id: newSubscription.subscription_id,
      school_id: newSchool.school_id,
      payment_provider: planType === "free" ? "none" : "pending",
      payment_method: planType === "free" ? "free" : "pending",
      amount_paid: amountPaid,
      currency: "NGN",
      tax_amount: 0,
      discount_amount: 0,
      total_amount: totalAmount,
      billing_cycle: subscriptionData.billingCycle || "monthly",
      billing_period_start: startDate,
      billing_period_end: endDate,
      payment_status: planType === "free" ? "completed" : "pending",
      payment_date: new Date(),
    });

    return {
      success: true,
      data: {
        school_id: newSchool.school_id,
        admin_id: newAdmin.admin_id,
        subscription_id: newSubscription.subscription_id,
      },
      message: "School setup completed successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: "Signup failed",
      message: error.message || "Failed to create account",
    };
  }
};

// ─── LOGIN (used internally after signup) ────────────────────────────────────
const login = async (email, password) => {
  try {
    // Step 1: Find user by email
    const user = await User.findOne({ email, user_type: "admin" });
    if (!user) {
      return { success: false, error: "Invalid credentials", message: "Email or password is incorrect" };
    }

    // Step 2: Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { success: false, error: "Invalid credentials", message: "Email or password is incorrect" };
    }

    // Step 3: Get admin profile
    const admin = await Admin.findOne({ admin_id: user.reference_id });
    if (!admin) {
      return { success: false, error: "Admin not found", message: "Admin profile not found" };
    }
    if (!admin.is_active) {
      return { success: false, error: "Account inactive", message: "Your account has been deactivated" };
    }

    // Step 4: Get school
    const school = await School.findOne({ school_id: admin.school_id });
    if (!school) {
      return { success: false, error: "School not found", message: "Associated school not found" };
    }

    // Step 5: Get subscription
    const subscriptions = await Subscription.find({ school_id: admin.school_id }).sort({ end_date: -1 });
    const subscription = subscriptions.find(
      (s) => s.subscription_status === "active" || s.subscription_status === "trialing"
    ) || subscriptions[0] || null;

    // Step 6: Sign JWT
    const token = jwt.sign(
      { user_id: user.user_id, user_type: user.user_type, reference_id: user.reference_id, school_id: admin.school_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _pw, ...adminWithoutPassword } = admin.toObject();

    return {
      success: true,
      data: {
        token,
        admin: adminWithoutPassword,
        user_id: user.user_id,
        school: school.toObject(),
        subscription: subscription ? subscription.toObject() : null,
      },
      message: "Login successful",
    };
  } catch (error) {
    return {
      success: false,
      error: "Login failed",
      message: error.message || "Failed to login",
    };
  }
};

module.exports = { signup, login };
