const Subscription = require("../models/Subscription.model");
const Plan = require("../models/Plan.model");
const Admin = require("../models/Admin.model");

const getPlan = async (schoolId) => {
  const now = new Date();
  const activeSub = await Subscription.findOne({
    school_id: schoolId,
    subscription_status: { $in: ["active", "trialing"] },
    end_date: { $gt: now },
  }).sort({ end_date: -1 });

  if (!activeSub) return null;
  return Plan.findOne({ plan_id: String(activeSub.plan_id) });
};

/**
 * Student counts are unlimited on all plans.
 */
const checkStudentLimit = async () => ({ allowed: true });

/**
 * Staff counts are unlimited on all plans.
 */
const checkStaffLimit = async () => ({ allowed: true });

/**
 * Check if school can promote a new sub-admin.
 */
const checkSubAdminLimit = async (schoolId) => {
  const plan = await getPlan(schoolId);
  const limit = plan ? parseInt(plan.max_subadmin) : 2;

  const currentSubAdmins = await Admin.countDocuments({
    school_id: schoolId,
    is_active: { $ne: false },
    admin_role: { $ne: "Super Admin" },
  });

  if (currentSubAdmins >= limit) {
    return {
      allowed: false,
      message: `Sub-admin limit reached. Your ${plan?.plan_name || "current"} plan allows up to ${limit} sub-admins. You currently have ${currentSubAdmins}.`,
    };
  }
  return { allowed: true };
};

module.exports = { checkStudentLimit, checkStaffLimit, checkSubAdminLimit };
