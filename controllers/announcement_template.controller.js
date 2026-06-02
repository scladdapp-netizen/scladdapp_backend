const AnnouncementTemplate = require("../models/AnnouncementTemplate.model");

const parseArrayField = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
};

const toResponse = (doc) => ({
  ...doc,
  channels:     parseArrayField(doc.channels),
  placeholders: parseArrayField(doc.placeholders),
});

const validate = (data) => {
  const errors = [];
  if (!data.name?.trim())    errors.push("Template name is required");
  if (!data.subject?.trim()) errors.push("Subject line is required");
  if (!data.content?.trim()) errors.push("Content is required");
  if (!data.category)        errors.push("Category is required");
  if (!data.channels || parseArrayField(data.channels).length === 0)
    errors.push("At least one delivery channel must be selected");
  return errors;
};

// POST /announcement-template
exports.createAnnouncementTemplate = async (req, res) => {
  try {
    const { school_id, name, description, category, subject, content, channels, placeholders, created_by } = req.body;

    if (!school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const template = await AnnouncementTemplate.create({
      template_id:   Date.now().toString(),
      school_id,
      name:          name.trim(),
      description:   description?.trim() || "",
      category:      category || "general",
      subject:       subject.trim(),
      content:       content.trim(),
      status:        "active",
      created_by:    created_by || null,
      last_modified: new Date(),
      modified_by:   created_by || null,
      channels:      JSON.stringify(channels || []),
      placeholders:  JSON.stringify(placeholders || []),
    });

    console.log("Announcement template created:", template.template_id);
    res.status(201).json({ success: true, message: "Announcement template created successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    console.error("Create announcement template error:", error);
    res.status(500).json({ success: false, message: "Failed to create announcement template", error: error.message });
  }
};

// GET /announcement-template/school/:schoolId
exports.getAnnouncementTemplatesBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const templates = await AnnouncementTemplate.find({ school_id: schoolId }).lean();
    const data = templates.map(toResponse);

    console.log(`Found ${data.length} announcement templates for school ${schoolId}`);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("Get announcement templates error:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve announcement templates", error: error.message });
  }
};

// GET /announcement-template/:templateId
exports.getAnnouncementTemplateById = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const template = await AnnouncementTemplate.findOne({ template_id: templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Announcement template not found" });

    res.json({ success: true, data: toResponse(template) });
  } catch (error) {
    console.error("Get announcement template error:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve announcement template", error: error.message });
  }
};

// PUT /announcement-template/:templateId
exports.updateAnnouncementTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { name, description, category, subject, content, channels, placeholders, status, modified_by } = req.body;

    const template = await AnnouncementTemplate.findOne({ template_id: templateId });
    if (!template) return res.status(404).json({ success: false, message: "Announcement template not found" });

    if (name !== undefined)        template.name         = name.trim();
    if (description !== undefined) template.description  = description.trim();
    if (category !== undefined)    template.category     = category;
    if (subject !== undefined)     template.subject      = subject.trim();
    if (content !== undefined)     template.content      = content.trim();
    if (status !== undefined)      template.status       = status;
    if (channels !== undefined)    template.channels     = JSON.stringify(channels);
    if (placeholders !== undefined) template.placeholders = JSON.stringify(placeholders);
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;

    await template.save();

    console.log("Announcement template updated:", templateId);
    res.json({ success: true, message: "Announcement template updated successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    console.error("Update announcement template error:", error);
    res.status(500).json({ success: false, message: "Failed to update announcement template", error: error.message });
  }
};

// DELETE /announcement-template/:templateId
exports.deleteAnnouncementTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const template = await AnnouncementTemplate.findOneAndDelete({ template_id: templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Announcement template not found" });

    console.log("Announcement template deleted:", templateId);
    res.json({ success: true, message: "Announcement template deleted successfully", data: template });
  } catch (error) {
    console.error("Delete announcement template error:", error);
    res.status(500).json({ success: false, message: "Failed to delete announcement template", error: error.message });
  }
};

// POST /announcement-template/:templateId/duplicate
exports.duplicateAnnouncementTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const original = await AnnouncementTemplate.findOne({ template_id: templateId }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Announcement template not found" });

    const { _id, ...rest } = original;
    const duplicate = await AnnouncementTemplate.create({
      ...rest,
      template_id:   Date.now().toString(),
      name:          `${original.name} (Copy)`,
      status:        "draft",
      created_by:    req.body.created_by || original.created_by,
      last_modified: new Date(),
      modified_by:   req.body.created_by || original.created_by,
    });

    console.log("Announcement template duplicated:", duplicate.template_id);
    res.status(201).json({ success: true, message: "Announcement template duplicated successfully", data: toResponse(duplicate.toObject()) });
  } catch (error) {
    console.error("Duplicate announcement template error:", error);
    res.status(500).json({ success: false, message: "Failed to duplicate announcement template", error: error.message });
  }
};

// PATCH /announcement-template/:templateId/status
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { status, modified_by } = req.body;

    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });
    if (!["active", "draft", "archived"].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required (active, draft, or archived)" });
    }

    const template = await AnnouncementTemplate.findOne({ template_id: templateId });
    if (!template) return res.status(404).json({ success: false, message: "Announcement template not found" });

    template.status        = status;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    const label = status === "active" ? "activated" : status === "archived" ? "archived" : "set to draft";
    console.log(`Announcement template ${templateId} status updated to ${status}`);
    res.json({ success: true, message: `Announcement template ${label} successfully`, data: template });
  } catch (error) {
    console.error("Update template status error:", error);
    res.status(500).json({ success: false, message: "Failed to update template status", error: error.message });
  }
};

module.exports = exports;
