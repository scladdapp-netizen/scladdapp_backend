const Subscription = require("../models/Subscription.model");
const Plan = require("../models/Plan.model");
const Admission = require("../models/Admission.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");

const getPlan = async (schoolId) => {
  const activeSub = await Subscription.findOne({
    school_id: schoolId,
    subscription_status: { $in: ["active", "trialing"] },
  }).sort({ end_date: -1 });

  if (!activeSub) return null;
  return Plan.findOne({ plan_id: String(activeSub.plan_id) });
};

/**
 * Check if school can admit/create a new student.
 */
const checkStudentLimit = async (schoolId) => {
  const plan = await getPlan(schoolId);
  const limit = plan ? parseInt(plan.max_students) : 10;

  const activeStudents = await Admission.distinct("student_id", {
    school_id: schoolId,
    active_status: true,
    is_graduated: { $ne: true },
  });

  if (activeStudents.length >= limit) {
    return {
      allowed: false,
      message: `Student limit reached. Your ${plan?.plan_name || "current"} plan allows up to ${limit} active students. You currently have ${activeStudents.length}.`,
    };
  }
  return { allowed: true };
};

/**
 * Check if school can create a new staff member.
 */
const checkStaffLimit = async (schoolId) => {
  const plan = await getPlan(schoolId);
  const limit = plan ? parseInt(plan.max_staff) : 10;

  const currentStaff = await Staff.countDocuments({
    school_id: schoolId,
    is_active: { $ne: false },
  });

  if (currentStaff >= limit) {
    return {
      allowed: false,
      message: `Staff limit reached. Your ${plan?.plan_name || "current"} plan allows up to ${limit} staff members. You currently have ${currentStaff}.`,
    };
  }
  return { allowed: true };
};

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
