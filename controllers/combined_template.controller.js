const CombinedTemplate = require("../models/CombinedTemplate.model");
const Subsession = require("../models/Subsession.model");

const isAssigned = async (templateId) => {
  const count = await Subsession.countDocuments({ grading_template_id: templateId });
  return count > 0;
};

const validate = (data) => {
  const errors = [];
  if (!data.name?.trim())            errors.push("Template name is required");
  if (!data.grading_fields?.length)  errors.push("At least one grading field is required");
  if (!data.grading_scheme?.length)  errors.push("At least one grading scheme entry is required");
  if (data.grading_fields?.length) {
    const total = data.grading_fields.reduce((s, f) => s + (parseInt(f.weight) || 0), 0);
    if (total !== 100) errors.push(`Total weight must equal 100%. Current: ${total}%`);
  }
  return errors;
};

// POST /grading-template
exports.createTemplate = async (req, res) => {
  try {
    if (!req.body.school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { grading_fields, grading_scheme, behavioral_traits, styling } = req.body;
    const totalWeight = grading_fields.reduce((s, f) => s + (parseInt(f.weight) || 0), 0);

    const template = await CombinedTemplate.create({
      template_id:      Date.now().toString(),
      school_id:        req.body.school_id,
      name:             req.body.name.trim(),
      description:      req.body.description?.trim() || "",
      status:           "active",
      grading_fields:   grading_fields.map((f) => ({ field_name: f.field_name, weight: parseInt(f.weight) || 0, max_score: f.max_score || 0 })),
      grading_scheme:   grading_scheme.map((s) => ({ grade_letter: s.grade_letter, min_range: s.min_range, max_range: s.max_range, grade_point: s.grade_point, pass_fail: s.pass_fail || "Pass" })),
      total_weight:     totalWeight,
      behavioral_traits: behavioral_traits || [],
      styling:          styling || { theme_id: "", theme_name: "", primaryColor: "#3b82f6" },
      created_by:       req.body.created_by || null,
      last_modified:    new Date(),
      modified_by:      req.body.created_by || null,
    });

    res.status(201).json({ success: true, message: "Template created successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create template", error: error.message });
  }
};

// GET /grading-template/school/:schoolId
exports.getTemplatesBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const templates = await CombinedTemplate.find({ school_id: schoolId }).lean();
    res.json({ success: true, data: templates, count: templates.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve templates", error: error.message });
  }
};

// GET /grading-template/:templateId
exports.getTemplateById = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve template", error: error.message });
  }
};

// GET /grading-template/:templateId/is-assigned
exports.checkIsAssigned = async (req, res) => {
  try {
    const assigned = await isAssigned(req.params.templateId);
    res.json({ success: true, assigned });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /grading-template/:templateId
exports.updateTemplate = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    const assigned = await isAssigned(req.params.templateId);

    // If assigned, only allow styling update
    if (assigned) {
      if (req.body.styling) {
        template.styling       = req.body.styling;
        template.last_modified = new Date();
        await template.save();
      }
      return res.json({ success: true, message: "Template styling updated", data: template });
    }

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { grading_fields, grading_scheme, behavioral_traits, styling } = req.body;
    const totalWeight = grading_fields?.reduce((s, f) => s + (parseInt(f.weight) || 0), 0) ?? template.total_weight;

    if (req.body.name !== undefined)        template.name             = req.body.name.trim();
    if (req.body.description !== undefined) template.description      = req.body.description.trim();
    if (req.body.status !== undefined)      template.status           = req.body.status;
    if (grading_fields !== undefined)       template.grading_fields   = grading_fields;
    if (grading_scheme !== undefined)       template.grading_scheme   = grading_scheme;
    if (behavioral_traits !== undefined)    template.behavioral_traits = behavioral_traits;
    if (styling !== undefined)              template.styling          = styling;
    template.total_weight  = totalWeight;
    template.last_modified = new Date();
    template.modified_by   = req.body.modified_by || template.modified_by;
    await template.save();

    res.json({ success: true, message: "Template updated successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update template", error: error.message });
  }
};

// DELETE /grading-template/:templateId
exports.deleteTemplate = async (req, res) => {
  try {
    const assigned = await isAssigned(req.params.templateId);
    if (assigned) return res.status(409).json({ success: false, message: "Cannot delete a template that is assigned to a subsession" });

    const template = await CombinedTemplate.findOneAndDelete({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    res.json({ success: true, message: "Template deleted successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete template", error: error.message });
  }
};

// POST /grading-template/:templateId/duplicate
exports.duplicateTemplate = async (req, res) => {
  try {
    const original = await CombinedTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Template not found" });

    const { _id, ...rest } = original;
    const duplicate = await CombinedTemplate.create({
      ...rest,
      template_id:   Date.now().toString(),
      name:          `${original.name} (Copy)`,
      status:        "draft",
      created_by:    req.body.created_by || original.created_by,
      last_modified: new Date(),
      modified_by:   req.body.created_by || original.created_by,
    });

    res.status(201).json({ success: true, message: "Template duplicated successfully", data: duplicate });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to duplicate template", error: error.message });
  }
};

// PATCH /grading-template/:templateId/status
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { status, modified_by } = req.body;
    if (!["active", "draft", "archived"].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status required: active, draft, or archived" });
    }

    const template = await CombinedTemplate.findOne({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    template.status        = status;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    res.json({ success: true, message: `Template status updated to ${status}`, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status", error: error.message });
  }
};

module.exports = exports;
