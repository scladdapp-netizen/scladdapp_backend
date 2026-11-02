const CombinedTemplate = require("../models/CombinedTemplate.model");
const Subsession = require("../models/Subsession.model");

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeFields = (list) =>
  (Array.isArray(list) ? list : [])
    .map((field) => ({
      field_name: String(field.field_name || field.fieldName || "").trim(),
      weight: num(field.weight),
      max_score: field.max_score ?? field.maxScore ?? 0,
    }))
    .filter((field) => field.field_name);

const normalizeScheme = (list) =>
  (Array.isArray(list) ? list : []).map((row) => ({
    grade_letter: row.grade_letter ?? row.gradeLetter ?? null,
    min_range: row.min_range ?? row.minRange ?? 0,
    max_range: row.max_range ?? row.maxRange ?? 100,
    grade_point: row.grade_point ?? row.gradePoint ?? null,
    pass_fail: row.pass_fail ?? row.passFail ?? null,
  }));

const normalizeOverrides = (list) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((row) => {
      const class_ids = [...new Set((row.class_ids || row.classIds || []).map(String).filter(Boolean))]
        .filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      return {
        name: String(row.name || "").trim(),
        class_ids,
        grading_fields: normalizeFields(row.grading_fields || row.gradingFields),
        grading_scheme: normalizeScheme(row.grading_scheme || row.gradingScheme),
        behavioral_traits: (row.behavioral_traits || row.behavioralTraits || []).map((trait) => String(trait).trim()).filter(Boolean),
      };
    })
    .filter((row) => row.class_ids.length);
};

const schemeErrors = (scheme, label) => {
  const errors = [];
  if (!scheme.length) return [`${label} needs at least one grade`];
  const covered = new Array(101).fill(false);
  const ranges = [];
  scheme.forEach((row, index) => {
    const lo = Number(row.min_range);
    const hi = Number(row.max_range);
    const letter = row.grade_letter || `Grade ${index + 1}`;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
      errors.push(`${label}: ${letter} has an invalid range`);
      return;
    }
    ranges.push({ lo, hi, letter });
    for (let point = Math.max(0, Math.ceil(lo)); point <= Math.min(100, Math.floor(hi)); point++) covered[point] = true;
  });
  for (let a = 0; a < ranges.length; a++) {
    for (let b = a + 1; b < ranges.length; b++) {
      if (ranges[a].lo <= ranges[b].hi && ranges[a].hi >= ranges[b].lo) {
        errors.push(`${label}: ${ranges[a].letter} overlaps ${ranges[b].letter}`);
      }
    }
  }
  if (covered.some((point) => !point)) errors.push(`${label} grades must cover every score from 0% to 100%`);
  return errors;
};

const sliceErrors = (fields, scheme, label) => {
  const errors = [];
  if (!fields.length) errors.push(`${label} needs at least one score, such as FT or Exam`);
  const weight = fields.reduce((sum, field) => sum + num(field.weight), 0);
  if (fields.length && weight !== 100) errors.push(`${label} score weights must add up to 100% (currently ${weight}%)`);
  errors.push(...schemeErrors(scheme, label));
  return errors;
};

const validate = (body) => {
  const errors = [];
  if (!String(body.name || "").trim()) errors.push("Template name is required");
  errors.push(...sliceErrors(normalizeFields(body.grading_fields), normalizeScheme(body.grading_scheme), "The default setup"));
  normalizeOverrides(body.class_overrides).forEach((row) => {
    errors.push(...sliceErrors(row.grading_fields, row.grading_scheme, row.name || "A class setup"));
  });
  return errors;
};

const isAssigned = async (templateId) => {
  const id = String(templateId);
  const numeric = Number(id);
  const query = Number.isFinite(numeric)
    ? { $or: [{ grading_template_id: id }, { grading_template_id: numeric }] }
    : { grading_template_id: id };
  return !!(await Subsession.exists(query));
};

const applyGrading = (template, body) => {
  const fields = normalizeFields(body.grading_fields);
  template.name = String(body.name).trim();
  template.description = body.description ?? "";
  template.grading_fields = fields;
  template.grading_scheme = normalizeScheme(body.grading_scheme);
  template.behavioral_traits = (body.behavioral_traits || []).map((trait) => String(trait).trim()).filter(Boolean);
  template.class_overrides = normalizeOverrides(body.class_overrides);
  template.total_weight = fields.reduce((sum, field) => sum + num(field.weight), 0);
  if (body.level !== undefined) template.level = body.level;
  if (body.layout !== undefined) template.layout = body.layout;
  if (body.grade_display !== undefined) template.grade_display = body.grade_display;
  if (body.styling !== undefined) template.styling = body.styling;
  if (body.html_template !== undefined) template.html_template = body.html_template;
  if (body.status !== undefined) template.status = body.status;
};

exports.createTemplate = async (req, res) => {
  try {
    if (!req.body.school_id) return res.status(400).json({ success: false, message: "School ID is required" });
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });
    const template = new CombinedTemplate({
      template_id: Date.now().toString(),
      school_id: String(req.body.school_id),
      created_by: req.body.created_by || null,
      modified_by: req.body.modified_by || req.body.created_by || null,
      last_modified: new Date(),
    });
    applyGrading(template, req.body);
    await template.save();
    res.status(201).json({ success: true, message: "Template created", data: template });
  } catch (error) {
    console.error("Create grading template error:", error);
    res.status(500).json({ success: false, message: "Failed to create template", error: error.message });
  }
};

exports.getTemplatesBySchool = async (req, res) => {
  try {
    const data = await CombinedTemplate.find({ school_id: String(req.params.schoolId) }).sort({ created_at: -1 }).lean();
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("Get grading templates error:", error);
    res.status(500).json({ success: false, message: "Failed to load templates", error: error.message });
  }
};

exports.getTemplateById = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    res.json({ success: true, data: template });
  } catch (error) {
    console.error("Get grading template error:", error);
    res.status(500).json({ success: false, message: "Failed to load template", error: error.message });
  }
};

exports.checkIsAssigned = async (req, res) => {
  try {
    res.json({ success: true, assigned: await isAssigned(req.params.templateId) });
  } catch (error) {
    console.error("Check template assignment error:", error);
    res.status(500).json({ success: false, message: "Failed to check template", error: error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    const assigned = await isAssigned(template.template_id);
    const gradingKeys = ["name", "description", "grading_fields", "grading_scheme", "behavioral_traits", "class_overrides"];
    const touchesGrading = gradingKeys.some((key) => req.body[key] !== undefined);
    if (assigned && touchesGrading) {
      return res.status(400).json({
        success: false,
        message: "This template is already used by a term, so its scores, grades, and class setups are locked.",
      });
    }
    if (assigned) {
      if (req.body.styling !== undefined) template.styling = req.body.styling;
      if (req.body.html_template !== undefined) template.html_template = req.body.html_template;
    } else {
      const errors = validate({ ...template.toObject(), ...req.body });
      if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });
      applyGrading(template, { ...template.toObject(), ...req.body });
    }
    template.last_modified = new Date();
    template.modified_by = req.body.modified_by || template.modified_by;
    await template.save();
    res.json({ success: true, message: "Template updated", data: template });
  } catch (error) {
    console.error("Update grading template error:", error);
    res.status(500).json({ success: false, message: "Failed to update template", error: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    if (await isAssigned(req.params.templateId)) {
      return res.status(400).json({ success: false, message: "This template is used by a term and cannot be deleted." });
    }
    const template = await CombinedTemplate.findOneAndDelete({ template_id: String(req.params.templateId) }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    res.json({ success: true, message: "Template deleted", data: template });
  } catch (error) {
    console.error("Delete grading template error:", error);
    res.status(500).json({ success: false, message: "Failed to delete template", error: error.message });
  }
};

exports.duplicateTemplate = async (req, res) => {
  try {
    const original = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Template not found" });
    const { _id, created_at, ...rest } = original;
    const duplicate = await CombinedTemplate.create({
      ...rest,
      template_id: Date.now().toString(),
      name: `${original.name} (Copy)`,
      status: "active",
      created_by: req.body.created_by || original.created_by,
      modified_by: req.body.created_by || original.created_by,
      last_modified: new Date(),
    });
    res.status(201).json({ success: true, message: "Template duplicated", data: duplicate });
  } catch (error) {
    console.error("Duplicate grading template error:", error);
    res.status(500).json({ success: false, message: "Failed to duplicate template", error: error.message });
  }
};

exports.updateTemplateStatus = async (req, res) => {
  try {
    const { status, modified_by } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be active or inactive" });
    }
    const template = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    template.status = status;
    template.last_modified = new Date();
    template.modified_by = modified_by || template.modified_by;
    await template.save();
    res.json({ success: true, message: "Template status updated", data: template });
  } catch (error) {
    console.error("Update grading template status error:", error);
    res.status(500).json({ success: false, message: "Failed to update status", error: error.message });
  }
};

exports.saveDraft = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    template.html_template_draft = req.body.html_template_draft || null;
    template.last_modified = new Date();
    await template.save();
    res.json({ success: true, message: "Draft saved", data: template });
  } catch (error) {
    console.error("Save grading template draft error:", error);
    res.status(500).json({ success: false, message: "Failed to save draft", error: error.message });
  }
};

exports.publishDraft = async (req, res) => {
  try {
    const template = await CombinedTemplate.findOne({ template_id: String(req.params.templateId) });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    if (template.html_template_draft) {
      template.html_template = template.html_template_draft;
      template.html_template_draft = null;
    }
    template.last_modified = new Date();
    template.modified_by = req.body.modified_by || template.modified_by;
    await template.save();
    res.json({ success: true, message: "Template published", data: template });
  } catch (error) {
    console.error("Publish grading template draft error:", error);
    res.status(500).json({ success: false, message: "Failed to publish draft", error: error.message });
  }
};
