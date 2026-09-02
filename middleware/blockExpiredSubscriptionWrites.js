/**
 * Blocks POST/PUT/PATCH/DELETE when the school's subscription is missing or expired.
 * GET/HEAD/OPTIONS always pass. Auth + subscription upgrade routes are allowlisted.
 */
const jwt = require("jsonwebtoken");
const { getSubscriptionAccess } = require("../utils/subscriptionAccess");

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ALLOW_PREFIXES = [
  "/login",
  "/setup",
  "/admin-auth",
  "/set-password",
  "/forgot-password",
  "/api/subscription",
  "/api/plans",
  "/api/support-tickets",
  "/api/app-feedback",
  "/api/otp",
  "/api/contact",
  "/api/gmail",
  "/api/download-proxy",
  "/sites",
  "/uploads",
];

const extractSchoolId = (req) => {
  const body = req.body || {};
  const params = req.params || {};
  const query = req.query || {};

  return (
    body.school_id ||
    body.schoolId ||
    params.schoolId ||
    params.school_id ||
    query.schoolId ||
    query.school_id ||
    req.headers["x-school-id"] ||
    null
  );
};

const extractSchoolIdFromAuth = (req) => {
  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ") || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return payload.school_id || payload.schoolId || null;
  } catch {
    return null;
  }
};

const isAllowlisted = (req) => {
  const url = String(req.originalUrl || req.url || "").split("?")[0];
  return ALLOW_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(prefix)
  );
};

const blockExpiredSubscriptionWrites = async (req, res, next) => {
  try {
    if (!MUTATING.has(String(req.method || "").toUpperCase())) return next();
    if (isAllowlisted(req)) return next();

    const schoolId = extractSchoolId(req) || extractSchoolIdFromAuth(req);
    if (!schoolId) return next();

    const access = await getSubscriptionAccess(schoolId);
    if (access.canMutate) return next();

    return res.status(403).json({
      success: false,
      code: access.code || "subscription_expired",
      message: access.message,
    });
  } catch (err) {
    console.error("blockExpiredSubscriptionWrites error:", err);
    return next();
  }
};

module.exports = { blockExpiredSubscriptionWrites };
