/**
 * AI Token Purchase Routes
 * -------------------------
 * POST /api/schools/:schoolId/ai-tokens/verify
 *   Called after Paystack payment succeeds on the frontend.
 *   Verifies the transaction with Paystack, then credits tokens to the school.
 *
 * GET  /api/schools/:schoolId/ai-tokens
 *   Returns the school's current AI token balance.
 *   (Same as aiWebsiteEdit route — kept here for convenience)
 */

const express       = require("express");
const jwt           = require("jsonwebtoken");
const SchoolAIToken = require("../models/SchoolAIToken.model");

const router = express.Router({ mergeParams: true });

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ── token packages — must match frontend PACKAGES array ──────────────────────
const PACKAGES = {
  starter:   { tokens: 10,  price: 500  },
  standard:  { tokens: 30,  price: 1200 },
  pro:       { tokens: 80,  price: 2800 },
  unlimited: { tokens: 200, price: 6000 },
};

// ─── middleware: verify school JWT ───────────────────────────────────────────
function verifyToken(req, res, next) {
  const tag    = "[AI-TOKEN-AUTH]";
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token provided" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.warn(`${tag} Invalid token — ${err.message}`);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ─── POST /api/schools/:schoolId/ai-tokens/verify ────────────────────────────
router.post("/:schoolId/ai-tokens/verify", verifyToken, async (req, res) => {
  const tag = "[AI-TOKEN-VERIFY]";
  try {
    const { schoolId }  = req.params;
    const { reference, packageId } = req.body;

    console.log(`${tag} school_id: ${schoolId}, ref: ${reference}, pkg: ${packageId}`);

    if (!reference) {
      return res.status(400).json({ success: false, message: "Payment reference is required" });
    }
    if (!packageId || !PACKAGES[packageId]) {
      return res.status(400).json({ success: false, message: "Invalid package" });
    }

    const pkg = PACKAGES[packageId];

    // ── 1. Verify with Paystack ─────────────────────────────────────────────
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ success: false, message: "Paystack secret key not configured on server" });
    }

    const psRes  = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const psData = await psRes.json();

    console.log(`${tag} Paystack verify status: ${psData?.data?.status}`);

    if (!psRes.ok || psData?.data?.status !== "success") {
      const msg = psData?.message || "Payment verification failed";
      console.warn(`${tag} Paystack rejected: ${msg}`);
      return res.status(400).json({ success: false, message: msg });
    }

    // ── 2. Confirm amount matches package price (in kobo) ───────────────────
    const paidKobo     = psData.data.amount;           // Paystack returns amount in kobo
    const expectedKobo = pkg.price * 100;

    if (paidKobo < expectedKobo) {
      console.warn(`${tag} Amount mismatch — paid: ${paidKobo}, expected: ${expectedKobo}`);
      return res.status(400).json({
        success: false,
        message: `Amount mismatch. Expected ₦${pkg.price}, received ₦${paidKobo / 100}`,
      });
    }

    // ── 3. Credit tokens ────────────────────────────────────────────────────
    const updated = await SchoolAIToken.findOneAndUpdate(
      { school_id: schoolId },
      {
        $inc: { balance: pkg.tokens, total_bought: pkg.tokens },
        $setOnInsert: { school_id: schoolId },
      },
      { upsert: true, new: true }
    );

    console.log(`${tag} Credited ${pkg.tokens} tokens to school ${schoolId}. New balance: ${updated.balance}`);

    return res.json({
      success:     true,
      tokensAdded: pkg.tokens,
      newBalance:  updated.balance,
      message:     `${pkg.tokens} tokens added to your account`,
    });

  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

module.exports = router;
