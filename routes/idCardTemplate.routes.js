/**
 * ID card catalog templates
 * Public (school app):
 *   GET /api/id-card-templates
 * Admin (portal JWT):
 *   GET    /api/id-card-templates/admin
 *   POST   /api/id-card-templates
 *   PATCH  /api/id-card-templates/:id
 *   DELETE /api/id-card-templates/:id
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const IdCardTemplate = require("../models/IdCardTemplate.model");

const router = express.Router();

function makeId() {
  return `ict_${Date.now().toString(36)}${Math.floor(Math.random() * 10000).toString(36)}`;
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function present(row) {
  const doc = row.document && typeof row.document === "object" ? row.document : {};
  return {
    ...doc,
    id: row.template_id,
    name: row.name || doc.name,
    type: row.card_type || doc.type || "student",
    sizeId: row.size_id || doc.sizeId,
    isActive: row.is_active !== false,
  };
}

router.get("/", async (req, res) => {
  try {
    const rows = await IdCardTemplate.find({ is_active: true }).sort({ created_at: 1 }).lean();
    return res.json({ success: true, data: rows.map(present) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/admin", verifyToken, async (req, res) => {
  try {
    const rows = await IdCardTemplate.find({}).sort({ created_at: 1 }).lean();
    return res.json({ success: true, data: rows.map(present) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const document = req.body?.document && typeof req.body.document === "object" ? req.body.document : req.body;
    if (!document || typeof document !== "object") {
      return res.status(400).json({ success: false, message: "A template document is required" });
    }
    const template_id = String(document.id || makeId());
    const row = await IdCardTemplate.create({
      template_id,
      name: String(document.name || "Untitled card").slice(0, 80),
      card_type: document.type === "staff" ? "staff" : "student",
      size_id: String(document.sizeId || "cr80-landscape"),
      document: { ...document, id: template_id },
      created_by: req.jwtPayload?.portal_admin_id || null,
      updated_by: req.jwtPayload?.portal_admin_id || null,
    });
    return res.status(201).json({ success: true, data: present(row.toObject()) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const document = req.body?.document && typeof req.body.document === "object" ? req.body.document : req.body;
    const row = await IdCardTemplate.findOneAndUpdate(
      { template_id: req.params.id },
      {
        name: String(document.name || "Untitled card").slice(0, 80),
        card_type: document.type === "staff" ? "staff" : "student",
        size_id: String(document.sizeId || "cr80-landscape"),
        document: { ...document, id: req.params.id },
        is_active: document.isActive !== false,
        updated_by: req.jwtPayload?.portal_admin_id || null,
      },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ success: false, message: "Template not found" });
    return res.json({ success: true, data: present(row) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const row = await IdCardTemplate.findOneAndDelete({ template_id: req.params.id }).lean();
    if (!row) return res.status(404).json({ success: false, message: "Template not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
