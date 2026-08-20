/**
 * Website Template Routes
 * -----------------------
 * Public (school app):
 *   GET  /api/website-templates          — list all active templates (sections + components)
 *
 * Admin only (portal admin JWT):
 *   GET    /api/website-templates/admin  — list all (including inactive)
 *   POST   /api/website-templates        — create template
 *   PATCH  /api/website-templates/:id    — update template
 *   DELETE /api/website-templates/:id    — delete template
 */

const express  = require("express");
const jwt      = require("jsonwebtoken");
const WebsiteTemplate = require("../models/WebsiteTemplate.model");

const router = express.Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function makeId() {
  return "wt_" + Date.now().toString() + Math.floor(Math.random() * 10000).toString();
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ── GET /api/website-templates — public, active only ─────────────────────────
router.get("/", async (req, res) => {
  const tag = "[WT-LIST-PUBLIC]";
  try {
    const templates = await WebsiteTemplate.find({ is_active: true })
      .sort({ type: 1, category: 1, sort_order: 1 })
      .lean();

    // Split into sections and components
    const sections    = templates.filter((t) => t.type === "section");
    const components  = templates.filter((t) => t.type === "component");

    console.log(`${tag} Returned ${sections.length} sections, ${components.length} components`);
    return res.status(200).json({ success: true, data: { sections, components } });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/website-templates/admin — admin, all ────────────────────────────
router.get("/admin", verifyToken, async (req, res) => {
  const tag = "[WT-LIST-ADMIN]";
  try {
    const templates = await WebsiteTemplate.find({})
      .sort({ type: 1, category: 1, sort_order: 1 })
      .lean();

    console.log(`${tag} Returned ${templates.length} templates`);
    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/website-templates — create ─────────────────────────────────────
router.post("/", verifyToken, async (req, res) => {
  const tag = "[WT-CREATE]";
  try {
    const { label, category, type, html, sort_order, is_active } = req.body;
    const { portal_admin_id } = req.jwtPayload;

    if (!label || !category || !html) {
      return res.status(400).json({ success: false, message: "label, category, and html are required" });
    }

    const validTypes = ["section", "component"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: "type must be section or component" });
    }

    const template = await WebsiteTemplate.create({
      template_id: makeId(),
      label:       label.trim(),
      category:    category.trim(),
      type:        type || "component",
      html:        html,
      sort_order:  sort_order ?? 0,
      is_active:   is_active !== false,
      created_by:  portal_admin_id,
      updated_by:  portal_admin_id,
    });

    console.log(`${tag} Created template_id: ${template.template_id}`);
    return res.status(201).json({ success: true, data: template, message: "Template created" });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/website-templates/:id — update ────────────────────────────────
router.patch("/:id", verifyToken, async (req, res) => {
  const tag = "[WT-UPDATE]";
  try {
    const { id }  = req.params;
    const { portal_admin_id } = req.jwtPayload;
    const { label, category, type, html, sort_order, is_active } = req.body;

    const template = await WebsiteTemplate.findOne({ template_id: id });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    if (label      !== undefined) template.label      = label.trim();
    if (category   !== undefined) template.category   = category.trim();
    if (type       !== undefined) template.type       = type;
    if (html       !== undefined) template.html       = html;
    if (sort_order !== undefined) template.sort_order = sort_order;
    if (is_active  !== undefined) template.is_active  = is_active;
    template.updated_by = portal_admin_id;

    await template.save();

    console.log(`${tag} Updated template_id: ${id}`);
    return res.status(200).json({ success: true, data: template, message: "Template updated" });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/website-templates/:id — delete ───────────────────────────────
router.delete("/:id", verifyToken, async (req, res) => {
  const tag = "[WT-DELETE]";
  try {
    const { id } = req.params;
    const { portal_admin_id } = req.jwtPayload;

    const template = await WebsiteTemplate.findOneAndDelete({ template_id: id });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    console.log(`${tag} Deleted template_id: ${id} by: ${portal_admin_id}`);
    return res.status(200).json({ success: true, message: "Template deleted" });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
