const ClassPromotionTemplate = require("../models/ClassPromotionTemplate.model");
const Class = require("../models/Class.model");

const parseField = (val) => {
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return val; } }
  return val;
};

const toResponse = (doc) => ({
  ...doc,
  criteria:         parseField(doc.criteria),
  class_promotions: parseField(doc.class_promotions),
  notifications:    parseField(doc.notifications),
});

const validate = (data) => {
  const errors = [];
  if (!data.name?.trim())                                    errors.push("Template name is required");
  if (!data.level)                                           errors.push("Grade level is required");
  if (!data.class_promotions?.length)                        errors.push("At least one class promotion mapping is required");
  (data.class_promotions || []).forEach((p, i) => {
    if (!p.from_class || !p.to_class)
      errors.push(`Promotion mapping ${i + 1}: Both from and to classes are required`);
  });
  return errors;
};

// POST /class-promotion-template
exports.createClassPromotionTemplate = async (req, res) => {
  try {
    if (!req.body.school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { school_id, name, description, level, criteria, class_promotions,
            retention_policy, appeal_process, notifications, created_by } = req.body;

    const totalWeight = (criteria || []).reduce((s, c) => s + (parseInt(c.weight) || 0), 0);

    const template = await ClassPromotionTemplate.create({
      template_id:      Date.now().toString(),
      school_id,
      name:             name.trim(),
      description:      description?.trim() || "",
      level:            level || "All Levels",
      status:           "active",
      created_by:       created_by || null,
      last_modified:    new Date(),
      modified_by:      created_by || null,
      criteria:         JSON.stringify(criteria || []),
      class_promotions: JSON.stringify(class_promotions || []),
      retention_policy: retention_policy?.trim() || "",
      appeal_process:   appeal_process?.trim() || "",
      notifications:    JSON.stringify(notifications || {}),
      total_weight:     totalWeight,
    });

    console.log("Class promotion template created:", template.template_id);
    res.status(201).json({ success: true, message: "Class promotion template created successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    console.error("Create class promotion template error:", error);
    res.status(500).json({ success: false, message: "Failed to create class promotion template", error: error.message });
  }
};

// GET /class-promotion-template/school/:schoolId
exports.getClassPromotionTemplatesBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const templates = await ClassPromotionTemplate.find({ school_id: schoolId }).lean();
    res.json({ success: true, data: templates.map(toResponse), count: templates.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve class promotion templates", error: error.message });
  }
};

// GET /class-promotion-template/:templateId
exports.getClassPromotionTemplateById = async (req, res) => {
  try {
    const template = await ClassPromotionTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Class promotion template not found" });
    res.json({ success: true, data: toResponse(template) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve class promotion template", error: error.message });
  }
};

// GET /class-promotion-template/classes/:schoolId
exports.getClassesForSchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const classes = await Class.find({ school_id: schoolId, is_active: true }).lean();
    const classOptions = [
      ...classes.map((c) => ({
        class_id:     c.class_id,
        class_name:   c.class_name,
        class_code:   c.class_code,
        class_section: c.class_section,
        display_name: `${c.class_name} - Section ${c.class_section}`,
      })),
      { class_id: "ALUMNI", class_name: "ALUMNI", class_code: "ALUMNI", class_section: "", display_name: "ALUMNI (Graduated)" },
    ];

    res.json({ success: true, data: classOptions, count: classOptions.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve classes", error: error.message });
  }
};

// PUT /class-promotion-template/:templateId
exports.updateClassPromotionTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { name, description, level, criteria, class_promotions,
            retention_policy, appeal_process, notifications, status, modified_by } = req.body;

    const template = await ClassPromotionTemplate.findOne({ template_id: templateId });
    if (!template) return res.status(404).json({ success: false, message: "Class promotion template not found" });

    const totalWeight = criteria
      ? criteria.reduce((s, c) => s + (parseInt(c.weight) || 0), 0)
      : template.total_weight;

    if (name !== undefined)             template.name             = name.trim();
    if (description !== undefined)      template.description      = description.trim();
    if (level !== undefined)            template.level            = level;
    if (status !== undefined)           template.status           = status;
    if (criteria !== undefined)         template.criteria         = JSON.stringify(criteria);
    if (class_promotions !== undefined) template.class_promotions = JSON.stringify(class_promotions);
    if (retention_policy !== undefined) template.retention_policy = retention_policy.trim();
    if (appeal_process !== undefined)   template.appeal_process   = appeal_process.trim();
    if (notifications !== undefined)    template.notifications    = JSON.stringify(notifications);
    template.total_weight  = totalWeight;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    console.log("Class promotion template updated:", templateId);
    res.json({ success: true, message: "Class promotion template updated successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update class promotion template", error: error.message });
  }
};

// DELETE /class-promotion-template/:templateId
exports.deleteClassPromotionTemplate = async (req, res) => {
  try {
    const template = await ClassPromotionTemplate.findOneAndDelete({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Class promotion template not found" });
    res.json({ success: true, message: "Class promotion template deleted successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete class promotion template", error: error.message });
  }
};

// POST /class-promotion-template/:templateId/duplicate
exports.duplicateClassPromotionTemplate = async (req, res) => {
  try {
    const original = await ClassPromotionTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Class promotion template not found" });

    const { _id, ...rest } = original;
    const duplicate = await ClassPromotionTemplate.create({
      ...rest,
      template_id:   Date.now().toString(),
      name:          `${original.name} (Copy)`,
      status:        "draft",
      created_by:    req.body.created_by || original.created_by,
      last_modified: new Date(),
      modified_by:   req.body.created_by || original.created_by,
    });

    res.status(201).json({ success: true, message: "Class promotion template duplicated successfully", data: toResponse(duplicate.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to duplicate class promotion template", error: error.message });
  }
};

// PATCH /class-promotion-template/:templateId/status
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { status, modified_by } = req.body;
    if (!["active", "draft", "archived"].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required (active, draft, or archived)" });
    }

    const template = await ClassPromotionTemplate.findOne({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Class promotion template not found" });

    template.status        = status;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    const label = status === "active" ? "activated" : status === "archived" ? "archived" : "set to draft";
    res.json({ success: true, message: `Class promotion template ${label} successfully`, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update template status", error: error.message });
  }
};

module.exports = exports;
