/**
 * Admin Portal Auth Routes
 * ------------------------
 * Uses the dedicated  portal_admins  collection only.
 * Never touches the main app's  admins / users / schools  collections.
 *
 * GET  /admin-auth/check            — does any portal admin exist?
 * POST /admin-auth/setup            — first-run: create first portal admin
 * POST /admin-auth/login            — login with email + password
 * POST /admin-auth/create-password  — set password for a null-password account
 * POST /admin-auth/logout           — log + confirm (stateless JWT)
 * POST /admin-auth/change-password  — change password (requires valid token)
 * POST /admin-auth/create-profile   — create a new portal admin account
 * GET  /admin-auth/me               — verify token & return profile
 */

const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");

const PortalAdmin      = require("../models/PortalAdmin.model");
const School           = require("../models/School.model");
const StaffActivityLog = require("../models/StaffActivityLog.model");
const Subscription     = require("../models/Subscription.model");
const Plan             = require("../models/Plan.model");

const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeId() {
  return Date.now().toString() + Math.floor(Math.random() * 1000).toString();
}

function signToken(admin) {
  return jwt.sign(
    {
      portal_admin_id: admin.portal_admin_id,
      email:           admin.email,
      role:            admin.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function safeAdmin(admin) {
  const obj = admin.toObject ? admin.toObject() : { ...admin };
  delete obj.password;
  return obj;
}

// ─── middleware: verify JWT ───────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const tag = "[PORTAL-AUTH-MW]";
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    console.warn(`${tag} No token provided`);
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`${tag} Token valid — portal_admin_id: ${req.jwtPayload.portal_admin_id}`);
    next();
  } catch (err) {
    console.warn(`${tag} Invalid/expired token — ${err.message}`);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ─── GET /admin-auth/check ────────────────────────────────────────────────────
router.get("/check", async (req, res) => {
  const tag = "[PORTAL-CHECK]";
  try {
    console.log(`${tag} Checking portal_admins collection`);
    const count       = await PortalAdmin.countDocuments({});
    const has_profile = count > 0;
    console.log(`${tag} portal_admins count: ${count} → has_profile: ${has_profile}`);
    return res.status(200).json({ success: true, has_profile });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/setup ───────────────────────────────────────────────────
// First-run only. Blocked if any portal admin already exists.
router.post("/setup", async (req, res) => {
  const tag = "[PORTAL-SETUP]";
  try {
    const { username, email, password } = req.body;
    console.log(`${tag} First-run setup — email: ${email}`);

    // Guard: blocked after first run
    const existing = await PortalAdmin.countDocuments({});
    if (existing > 0) {
      console.warn(`${tag} Setup blocked — ${existing} portal admin(s) already exist`);
      return res.status(403).json({
        success: false,
        message: "Setup already completed. Use the login page.",
      });
    }

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "username, email, and password are required",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const admin = await PortalAdmin.create({
      portal_admin_id: makeId(),
      username,
      email,
      password: hashed,
      role:     "super_admin",
      is_active: true,
      last_login_at: new Date(),
    });

    const token = signToken(admin);
    console.log(`${tag} Setup complete — portal_admin_id: ${admin.portal_admin_id}`);

    return res.status(201).json({
      success: true,
      data:    { token, admin: safeAdmin(admin) },
      message: "Portal setup complete. You are now logged in.",
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/login ───────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const tag = "[PORTAL-LOGIN]";
  try {
    const { email, password } = req.body;
    console.log(`${tag} Attempt — email: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required" });
    }

    const admin = await PortalAdmin.findOne({ email });
    if (!admin) {
      console.warn(`${tag} No portal admin found: ${email}`);
      return res.status(401).json({ success: false, message: "Email or password is incorrect" });
    }

    // No password set yet
    if (!admin.password) {
      console.warn(`${tag} No password set for: ${email}`);
      return res.status(200).json({
        success:     false,
        no_password: true,
        code:        "NO_PASSWORD",
        message:     "No password set. Please create one.",
      });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      console.warn(`${tag} Wrong password for: ${email}`);
      return res.status(401).json({ success: false, message: "Email or password is incorrect" });
    }

    if (!admin.is_active) {
      console.warn(`${tag} Deactivated account: ${email}`);
      return res.status(403).json({ success: false, message: "This account has been deactivated" });
    }

    admin.last_login_at = new Date();
    await admin.save();

    const token = signToken(admin);
    console.log(`${tag} Login success — portal_admin_id: ${admin.portal_admin_id}`);

    return res.status(200).json({
      success: true,
      data:    { token, admin: safeAdmin(admin) },
      message: "Login successful",
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/create-password ────────────────────────────────────────
// For accounts that have password: null
router.post("/create-password", async (req, res) => {
  const tag = "[PORTAL-CREATE-PW]";
  try {
    const { email, password } = req.body;
    console.log(`${tag} Request for email: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const admin = await PortalAdmin.findOne({ email });
    if (!admin) {
      console.warn(`${tag} No portal admin found: ${email}`);
      return res.status(404).json({ success: false, message: "No account found with this email" });
    }

    if (admin.password) {
      console.warn(`${tag} Password already set for: ${email}`);
      return res.status(400).json({ success: false, message: "Password already set. Use change-password instead." });
    }

    admin.password      = await bcrypt.hash(password, 10);
    admin.is_active     = true;
    admin.last_login_at = new Date();
    await admin.save();

    const token = signToken(admin);
    console.log(`${tag} Password created & token issued for: ${email}`);

    return res.status(200).json({
      success: true,
      data:    { token, admin: safeAdmin(admin) },
      message: "Password created successfully",
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/logout ──────────────────────────────────────────────────
router.post("/logout", verifyToken, async (req, res) => {
  const tag = "[PORTAL-LOGOUT]";
  try {
    const { portal_admin_id } = req.jwtPayload;
    console.log(`${tag} Logout — portal_admin_id: ${portal_admin_id}`);
    return res.status(200).json({ success: true, message: "Logged out. Clear the token on the client." });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/change-password ────────────────────────────────────────
router.post("/change-password", verifyToken, async (req, res) => {
  const tag = "[PORTAL-CHANGE-PW]";
  try {
    const { currentPassword, newPassword } = req.body;
    const { portal_admin_id }              = req.jwtPayload;
    console.log(`${tag} Request from portal_admin_id: ${portal_admin_id}`);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: "New password must differ from the current one" });
    }

    const admin = await PortalAdmin.findOne({ portal_admin_id });
    if (!admin) return res.status(404).json({ success: false, message: "Account not found" });

    if (!admin.password) {
      return res.status(400).json({ success: false, message: "No password set. Use create-password first." });
    }

    const match = await bcrypt.compare(currentPassword, admin.password);
    if (!match) {
      console.warn(`${tag} Wrong current password for portal_admin_id: ${portal_admin_id}`);
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    admin.password   = await bcrypt.hash(newPassword, 10);
    admin.updated_at = new Date();
    await admin.save();

    console.log(`${tag} Password changed for portal_admin_id: ${portal_admin_id}`);
    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── POST /admin-auth/create-profile ─────────────────────────────────────────
// Create additional portal admin accounts (requires no token — guarded by caller)
router.post("/create-profile", async (req, res) => {
  const tag = "[PORTAL-CREATE-PROFILE]";
  try {
    const { username, email, password, role } = req.body;
    console.log(`${tag} Creating portal admin — email: ${email}`);

    if (!username || !email) {
      return res.status(400).json({ success: false, message: "username and email are required" });
    }

    const dup = await PortalAdmin.findOne({ email });
    if (dup) {
      console.warn(`${tag} Email already in use: ${email}`);
      return res.status(400).json({ success: false, message: "An account with this email already exists" });
    }

    let hashed = null;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
      }
      hashed = await bcrypt.hash(password, 10);
    }

    const admin = await PortalAdmin.create({
      portal_admin_id: makeId(),
      username,
      email,
      password: hashed,
      role:     role || "admin",
      is_active: true,
    });

    console.log(`${tag} Created portal_admin_id: ${admin.portal_admin_id}`);

    // Issue token immediately if password was provided
    let responseData = { admin: safeAdmin(admin) };
    if (hashed) {
      responseData.token = signToken(admin);
    }

    return res.status(201).json({
      success: true,
      data:    responseData,
      message: hashed
        ? "Profile created and token issued"
        : "Profile created. No password set — use create-password on first login.",
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── GET /admin-auth/subscriptions ───────────────────────────────────────────
// Paginated list of all subscriptions enriched with school name and plan name.
// Requires valid portal admin token.
router.get("/subscriptions", verifyToken, async (req, res) => {
  const tag = "[PORTAL-SUBSCRIPTIONS]";
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
    const search = (req.query.search || "").trim();
    const field  = req.query.searchField || "";

    console.log(`${tag} page:${page} limit:${limit} search:"${search}" field:"${field}"`);

    // build query
    let query = {};
    if (search) {
      const allowed = ["subscription_status", "subscription_type", "school_id"];
      const sf = allowed.includes(field) ? field : "subscription_status";
      query[sf] = { $regex: search, $options: "i" };
    }

    const totalRecords = await Subscription.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    const skip         = (page - 1) * limit;

    const subs = await Subscription.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // enrich with school name + plan name in one pass
    const schoolIds = [...new Set(subs.map((s) => s.school_id))];
    // normalise all plan_ids to string for consistent matching
    const planIds   = [...new Set(subs.map((s) => String(s.plan_id)))];

    const [schools, plans] = await Promise.all([
      School.find({ school_id: { $in: schoolIds } }).select("school_id school_name").lean(),
      Plan.find({}).select("plan_id plan_name plan_type monthly_price yearly_price quataly_price").lean(),
    ]);

    const schoolMap = Object.fromEntries(schools.map((s) => [s.school_id, s.school_name]));
    // key plan map by String(plan_id) to handle mixed number/string storage
    const planMap   = Object.fromEntries(
      plans.map((p) => [String(p.plan_id), {
        name:           p.plan_name,
        type:           p.plan_type,
        monthly_price:  p.monthly_price,
        yearly_price:   p.yearly_price,
        quataly_price:  p.quataly_price,
      }])
    );

    const enriched = subs.map((s) => {
      const pid  = String(s.plan_id);
      const plan = planMap[pid] || {};
      return {
        ...s,
        school_name:    schoolMap[s.school_id] || s.school_id,
        plan_name:      plan.name  || `Plan ${pid}`,
        plan_type:      plan.type  || null,
        monthly_price:  plan.monthly_price  ?? null,
        yearly_price:   plan.yearly_price   ?? null,
        quataly_price:  plan.quataly_price  ?? null,
      };
    });

    const startIndex = totalRecords === 0 ? 0 : skip + 1;
    const endIndex   = Math.min(skip + limit, totalRecords);

    console.log(`${tag} returned ${enriched.length} / ${totalRecords} subscriptions`);

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        currentPage:    page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage:    page < totalPages,
        hasPrevPage:    page > 1,
        startIndex,
        endIndex,
      },
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── GET /admin-auth/schools/:schoolId ───────────────────────────────────────
// Single school detail with activity enrichment. Requires valid portal admin token.
router.get("/schools/:schoolId", verifyToken, async (req, res) => {
  const tag = "[PORTAL-SCHOOL-DETAIL]";
  try {
    const { schoolId } = req.params;
    console.log(`${tag} Fetching school_id: ${schoolId}`);

    const school = await School.findOne({ school_id: schoolId }).lean();
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found" });
    }

    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const latestLog = await StaffActivityLog.findOne({ school_id: schoolId })
      .sort({ performed_at: -1 })
      .lean();

    const last_activity_at = latestLog?.performed_at || null;
    const last_action      = latestLog?.action || null;
    const last_action_desc = latestLog?.description || null;

    const enriched = {
      ...school,
      last_activity_at,
      last_action,
      last_action_desc,
      is_active: last_activity_at ? last_activity_at >= oneMonthAgo : false,
    };

    console.log(`${tag} Found: ${school.school_name}, last_activity: ${last_activity_at}`);
    return res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── GET /admin-auth/schools ─────────────────────────────────────────────────
// Paginated list of all schools with activity status.
// is_active = true  if the school has any activity log in the past 30 days.
// last_activity_at  = performed_at of the most recent log for that school.
// Requires valid portal admin token.
router.get("/schools", verifyToken, async (req, res) => {
  const tag = "[PORTAL-SCHOOLS]";
  try {
    const page   = Math.max(1, parseInt(req.query.page)   || 1);
    const limit  = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
    const search = (req.query.search || "").trim();
    const field  = req.query.searchField || "";

    console.log(`${tag} page:${page} limit:${limit} search:"${search}" field:"${field}"`);

    // ── build search query ────────────────────────────────────────────────
    let query = {};
    if (search) {
      const allowed     = ["school_name", "email", "country", "state", "address", "phone_number"];
      const searchField = allowed.includes(field) ? field : "school_name";
      query[searchField] = { $regex: search, $options: "i" };
    }

    const totalRecords = await School.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    const skip         = (page - 1) * limit;

    const schools = await School.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ── enrich with activity data ─────────────────────────────────────────
    // one aggregation to get last activity date per school for this page's school_ids
    const schoolIds   = schools.map((s) => s.school_id);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // get the latest log per school_id (only for current page — keeps it fast)
    const activityAgg = await StaffActivityLog.aggregate([
      { $match: { school_id: { $in: schoolIds } } },
      { $sort:  { performed_at: -1 } },
      {
        $group: {
          _id:              "$school_id",
          last_activity_at: { $first: "$performed_at" },
        },
      },
    ]);

    // build lookup map  school_id → last_activity_at
    const activityMap = {};
    activityAgg.forEach((a) => { activityMap[a._id] = a.last_activity_at; });

    // attach fields to each school
    const enriched = schools.map((s) => {
      const last = activityMap[s.school_id] || null;
      return {
        ...s,
        last_activity_at: last,
        is_active: last ? last >= oneMonthAgo : false,
      };
    });

    const startIndex = totalRecords === 0 ? 0 : skip + 1;
    const endIndex   = Math.min(skip + limit, totalRecords);

    console.log(`${tag} returned ${enriched.length} / ${totalRecords} schools`);

    return res.status(200).json({
      success: true,
      data:    enriched,
      pagination: {
        currentPage:    page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage:    page < totalPages,
        hasPrevPage:    page > 1,
        startIndex,
        endIndex,
      },
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// ─── GET /admin-auth/me ───────────────────────────────────────────────────────
router.get("/me", verifyToken, async (req, res) => {
  const tag = "[PORTAL-ME]";
  try {
    const { portal_admin_id } = req.jwtPayload;
    console.log(`${tag} Fetching profile for portal_admin_id: ${portal_admin_id}`);

    const admin = await PortalAdmin.findOne({ portal_admin_id });
    if (!admin || !admin.is_active) {
      return res.status(404).json({ success: false, message: "Account not found or deactivated" });
    }

    const token = signToken(admin);
    console.log(`${tag} Profile returned for: ${admin.email}`);

    return res.status(200).json({
      success: true,
      data:    { token, admin: safeAdmin(admin) },
      message: "Profile fetched",
    });
  } catch (error) {
    console.error(`${tag} Error:`, error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

module.exports = router;
