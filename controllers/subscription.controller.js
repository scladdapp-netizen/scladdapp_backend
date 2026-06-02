const Subscription = require("../models/Subscription.model");
const Plan = require("../models/Plan.model");
const Payment = require("../models/Payment.model");
const Student = require("../models/Student.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");
const ClassResource = require("../models/ClassResource.model");
const TeacherResource = require("../models/TeacherResource.model");
const StaffResource = require("../models/StaffResource.model");
const SubjectResource = require("../models/SubjectResource.model");
const StaffCredential = require("../models/StaffCredential.model");
const SchoolResource = require("../models/SchoolResource.model");
const SchoolGallery = require("../models/SchoolGallery.model");
const { readData } = require("../utils/file");

const getPlansFromFile = () => {
  try {
    return readData("./data/plans.json");
  } catch { return []; }
};

const findPlan = async (planId) => {
  // Try MongoDB first, fall back to JSON file
  const mongoplan = await Plan.findOne({ plan_id: String(planId) }).lean();
  if (mongoplan) return mongoplan;
  const plans = getPlansFromFile();
  return plans.find(p => String(p["$id"]) === String(planId) || String(p.plan_id) === String(planId)) || null;
};

const getSchoolStorageBytes = async (schoolId) => {
  const collections = [ClassResource, TeacherResource, StaffResource, SubjectResource, StaffCredential, SchoolResource, SchoolGallery];
  let total = 0;
  for (const Model of collections) {
    try {
      const result = await Model.aggregate([
        { $match: { school_id: schoolId } },
        { $group: { _id: null, total: { $sum: "$file_size" } } },
      ]);
      total += result[0]?.total || 0;
    } catch { /* skip */ }
  }
  return total;
};

// GET /api/subscription/school/:schoolId/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const { schoolId } = req.params;

    const subscription = await Subscription.findOne({
      school_id: schoolId,
    }).sort({ end_date: -1 });

    if (!subscription) {
      const plans = getPlansFromFile();
      const freePlan = plans.find(p => (p.plan_type || "").toLowerCase() === "free");
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);
      await Subscription.create({
        subscription_id:     Date.now().toString(),
        school_id:           schoolId,
        plan_id:             freePlan ? String(freePlan["$id"] || freePlan.plan_id) : "free",
        subscription_type:   "free",
        subscription_status: "active",
        start_date:          now,
        end_date:            endDate,
      });
      return exports.getDashboard(req, res);
    }

    const plan = await findPlan(subscription.plan_id);

    const daysLeft = Math.max(0, Math.ceil((new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24)));

    const [activeStudents, activeStaff, activeSubAdmins, storageBytes] = await Promise.all([
      Student.countDocuments({ school_id: schoolId, is_active: { $ne: false } }),
      Staff.countDocuments({ school_id: schoolId, is_active: { $ne: false } }),
      Admin.countDocuments({ school_id: schoolId, is_active: { $ne: false }, admin_role: { $ne: "Super Admin" } }),
      getSchoolStorageBytes(schoolId),
    ]);

    const storageGB    = parseFloat((storageBytes / (1024 ** 3)).toFixed(3));
    const storageLimitGB = plan?.max_storage_gb || 1;

    res.json({
      success: true,
      data: {
        subscription: {
          subscription_id:     subscription.subscription_id,
          subscription_type:   subscription.subscription_type,
          subscription_status: subscription.subscription_status,
          start_date:          subscription.start_date,
          end_date:            subscription.end_date,
          days_left:           daysLeft,
        },
        plan,
        usage: {
          students:  { current: activeStudents,  limit: plan ? parseInt(plan.max_students)  : 0 },
          staff:     { current: activeStaff,     limit: plan ? parseInt(plan.max_staff)     : 0 },
          subadmins: { current: activeSubAdmins, limit: plan ? parseInt(plan.max_subadmin)  : 0 },
          storage:   { current: storageGB, limit: storageLimitGB, unit: "GB" },
        },
      },
    });
  } catch (error) {
    console.error("Subscription dashboard error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/subscription/plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().lean();
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/subscription/school/:schoolId/upgrade
exports.upgradeSubscription = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { plan_id, billing_cycle, total_months, amount_paid, transaction_reference } = req.body;

    if (!plan_id || !billing_cycle || !total_months) {
      return res.status(400).json({ success: false, message: "plan_id, billing_cycle, and total_months are required" });
    }

    const plan = await findPlan(plan_id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

    const now     = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + Number(total_months));

    // Cancel existing active subscriptions
    await Subscription.updateMany(
      { school_id: schoolId, subscription_status: "active" },
      { $set: { subscription_status: "cancelled", canceled_at: now } }
    );

    const newSubscription = await Subscription.create({
      subscription_id:     Date.now().toString(),
      school_id:           schoolId,
      plan_id:             String(plan["$id"] || plan.plan_id || plan_id),
      subscription_type:   (plan.plan_type || "").toLowerCase() === "free" ? "free" : "paid",
      subscription_status: "active",
      start_date:          now,
      end_date:            endDate,
      canceled_at:         null,
    });

    const newPayment = await Payment.create({
      payment_id:              (Date.now() + 1).toString(),
      subscription_id:         newSubscription.subscription_id,
      school_id:               schoolId,
      payment_provider:        amount_paid > 0 ? "paystack" : "none",
      provider_transaction_id: transaction_reference || null,
      payment_method:          amount_paid > 0 ? "card" : "free",
      amount_paid:             amount_paid || 0,
      currency:                "NGN",
      billing_cycle,
      billing_period_start:    now,
      billing_period_end:      endDate,
      payment_status:          "completed",
      payment_date:            now,
    });

    res.json({ success: true, message: "Subscription upgraded successfully", data: { subscription: newSubscription, payment: newPayment } });
  } catch (error) {
    console.error("Upgrade subscription error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/subscription/school/:schoolId/payments/paginated
exports.getPaymentsPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 15, search = "" } = req.query;

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);

    // Get all payments for this school
    let payments = await Payment.find({ school_id: schoolId }).sort({ payment_date: -1 }).lean();

    // Enrich with plan names via subscriptions
    const subIds = [...new Set(payments.map((p) => p.subscription_id))];
    const subscriptions = await Subscription.find({ subscription_id: { $in: subIds } }).lean();
    const subMap = {};
    subscriptions.forEach((s) => { subMap[s.subscription_id] = s; });

    const planIds = [...new Set(subscriptions.map((s) => String(s.plan_id)))];
    const planEntries = await Promise.all(planIds.map(async (id) => [id, await findPlan(id)]));
    const planMap = {};
    planEntries.forEach(([id, plan]) => { if (plan) planMap[id] = plan.plan_name; });

    let enriched = payments.map((p) => {
      const sub = subMap[p.subscription_id] || {};
      return {
        payment_id:              p.payment_id,
        subscription_id:         p.subscription_id,
        plan_name:               planMap[String(sub.plan_id)] || "—",
        billing_cycle:           p.billing_cycle || "—",
        amount_paid:             p.amount_paid || 0,
        currency:                p.currency || "NGN",
        payment_method:          p.payment_method || "—",
        payment_provider:        p.payment_provider || "—",
        provider_transaction_id: p.provider_transaction_id || null,
        payment_status:          p.payment_status || "—",
        billing_period_start:    p.billing_period_start || null,
        billing_period_end:      p.billing_period_end || null,
        payment_date:            p.payment_date || p.created_at || null,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      enriched = enriched.filter((p) =>
        (p.plan_name || "").toLowerCase().includes(q) ||
        (p.billing_cycle || "").toLowerCase().includes(q) ||
        (p.payment_status || "").toLowerCase().includes(q) ||
        (p.provider_transaction_id || "").toLowerCase().includes(q)
      );
    }

    const totalRecords = enriched.length;
    const totalPages   = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex   = (pageNum - 1) * limitNum;

    res.json({
      success: true,
      data: enriched.slice(startIndex, startIndex + limitNum),
      pagination: {
        currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
