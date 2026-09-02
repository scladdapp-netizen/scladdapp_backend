/**
 * Payment Plans — Portal Admin only (JWT required)
 * GET    /api/plans           — list all plans
 * POST   /api/plans           — create a plan
 * PATCH  /api/plans/:planId   — update a plan
 * DELETE /api/plans/:planId   — delete a plan
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const Plan = require("../models/Plan.model");

const router = express.Router();

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function toNumber(val, fallback = 0) {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFeatures(features) {
  if (Array.isArray(features)) {
    return features.map((f) => String(f).trim()).filter(Boolean);
  }
  if (typeof features === "string") {
    return features
      .split(/\n|,/)
      .map((f) => f.trim())
      .filter(Boolean);
  }
  return [];
}

function pickPlanBody(body = {}) {
  const out = {};
  if (body.plan_name !== undefined) out.plan_name = String(body.plan_name).trim();
  if (body.plan_type !== undefined) out.plan_type = body.plan_type === "Free" ? "Free" : "paid";
  if (body.description !== undefined) out.description = String(body.description || "");
  if (body.max_subadmin !== undefined) {
    out.max_subadmin = body.max_subadmin === null || body.max_subadmin === ""
      ? null
      : String(body.max_subadmin);
  }
  if (body.max_storage_gb !== undefined) out.max_storage_gb = toNumber(body.max_storage_gb, 0);
  if (body.ai_assistant !== undefined) out.ai_assistant = Boolean(body.ai_assistant);
  if (body.featured !== undefined) out.featured = Boolean(body.featured);
  if (body.monthly_price !== undefined) out.monthly_price = toNumber(body.monthly_price, 0);
  if (body.quataly_price !== undefined) out.quataly_price = toNumber(body.quataly_price, 0);
  if (body.yearly_price !== undefined) out.yearly_price = toNumber(body.yearly_price, 0);
  if (body.price !== undefined) out.price = body.price;
  if (body.features !== undefined) out.features = normalizeFeatures(body.features);
  // Students/staff stay unlimited; ignore numeric caps if sent
  if (body.max_students !== undefined) out.max_students = null;
  if (body.max_staff !== undefined) out.max_staff = null;
  return out;
}

/**
 * Match string or number plan_id.
 * Mongoose casts schema String queries, so numeric docs never match via Plan.findOne —
 * use the native collection for lookup, then hydrate for .save().
 */
async function findPlanDoc(planId) {
  const sid = String(planId);
  const or = [{ plan_id: sid }];
  const num = Number(planId);
  if (Number.isFinite(num) && String(num) === sid) or.push({ plan_id: num });

  const raw = await Plan.collection.findOne({ $or: or });
  if (!raw) return null;

  const doc = await Plan.findById(raw._id);
  if (doc && typeof doc.plan_id !== "string") {
    doc.plan_id = String(doc.plan_id);
  }
  return doc;
}

router.get("/", verifyToken, async (req, res) => {
  try {
    const plans = await Plan.find().sort({ monthly_price: 1 }).lean();
    const data = plans.map((p) => ({ ...p, plan_id: String(p.plan_id) }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { plan_name, plan_type } = req.body || {};
    if (!plan_name || !String(plan_name).trim()) {
      return res.status(400).json({ success: false, message: "plan_name is required" });
    }

    let planId = req.body.plan_id != null ? String(req.body.plan_id).trim() : "";
    if (!planId) planId = String(Date.now());

    const exists = await findPlanDoc(planId);
    if (exists) {
      return res.status(409).json({ success: false, message: "plan_id already exists" });
    }

    const payload = pickPlanBody(req.body);
    const plan = await Plan.create({
      plan_id: planId,
      plan_name: payload.plan_name,
      plan_type: payload.plan_type || (plan_type === "Free" ? "Free" : "paid"),
      description: payload.description || "",
      max_students: null,
      max_staff: null,
      max_subadmin: payload.max_subadmin ?? "2",
      max_storage_gb: payload.max_storage_gb ?? 1,
      ai_assistant: payload.ai_assistant ?? false,
      featured: payload.featured ?? false,
      monthly_price: payload.monthly_price ?? 0,
      quataly_price: payload.quataly_price ?? 0,
      yearly_price: payload.yearly_price ?? 0,
      price: payload.price ?? payload.monthly_price ?? 0,
      features: payload.features || [],
    });

    return res.status(201).json({ success: true, data: plan, message: "Plan created" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.patch("/:planId", verifyToken, async (req, res) => {
  try {
    const plan = await findPlanDoc(req.params.planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const updates = pickPlanBody(req.body);
    Object.assign(plan, updates);
    plan.plan_id = String(plan.plan_id);

    if (updates.monthly_price !== undefined && req.body.price === undefined) {
      plan.price = updates.monthly_price;
    }

    await plan.save();
    return res.json({ success: true, data: plan, message: "Plan updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.delete("/:planId", verifyToken, async (req, res) => {
  try {
    const plan = await findPlanDoc(req.params.planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    await Plan.deleteOne({ _id: plan._id });
    return res.json({ success: true, message: "Plan deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

module.exports = router;
