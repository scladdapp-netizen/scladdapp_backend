const TimetableTemplate = require("../models/TimetableTemplate.model");

const parseField = (val) => {
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return val; } }
  return val;
};

const toResponse = (doc) => ({
  ...doc,
  daily_periods:  parseField(doc.daily_periods),
  selected_days:  parseField(doc.selected_days),
  daily_schedule: parseField(doc.daily_schedule),
  breaks:         parseField(doc.breaks),
});

const timeToMinutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

const validate = (data) => {
  const errors = [];
  if (!data.name?.trim())                                    errors.push("Template name is required");
  if (!data.type)                                            errors.push("Template type is required");
  if (!data.selected_days?.length)                           errors.push("At least one day must be selected");
  (data.selected_days || []).forEach((day) => {
    if (!data.daily_periods?.[day] || data.daily_periods[day] <= 0) errors.push(`${day} must have at least 1 period`);
    const sched = data.daily_schedule?.[day];
    if (!sched?.start_time || !sched?.end_time) errors.push(`${day} must have start and end times`);
    else if (timeToMinutes(sched.start_time) >= timeToMinutes(sched.end_time)) errors.push(`${day}: End time must be after start time`);
  });
  (data.breaks || []).forEach((b, i) => {
    if (!b.name?.trim())          errors.push(`Break ${i + 1}: Name is required`);
    if (!b.duration || b.duration < 5) errors.push(`Break ${i + 1}: Duration must be at least 5 minutes`);
    if (!b.days?.length)          errors.push(`Break ${i + 1}: Must apply to at least one day`);
  });
  return errors;
};

// POST /timetable-template
exports.createTimetableTemplate = async (req, res) => {
  try {
    if (!req.body.school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { school_id, name, description, type, daily_periods, selected_days, max_period_duration, daily_schedule, breaks, created_by } = req.body;

    const template = await TimetableTemplate.create({
      template_id:         Date.now().toString(),
      school_id,
      name:                name.trim(),
      description:         description?.trim() || "",
      type:                type || "weekly",
      status:              "active",
      created_by:          created_by || null,
      last_modified:       new Date(),
      modified_by:         created_by || null,
      daily_periods:       JSON.stringify(daily_periods || {}),
      selected_days:       JSON.stringify(selected_days || []),
      max_period_duration: max_period_duration || 40,
      daily_schedule:      JSON.stringify(daily_schedule || {}),
      breaks:              JSON.stringify(breaks || []),
    });

    console.log("Timetable template created:", template.template_id);
    res.status(201).json({ success: true, message: "Timetable template created successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create timetable template", error: error.message });
  }
};

// GET /timetable-template/school/:schoolId
exports.getTimetableTemplatesBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const templates = await TimetableTemplate.find({ school_id: schoolId }).lean();
    res.json({ success: true, data: templates.map(toResponse), count: templates.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve timetable templates", error: error.message });
  }
};

// GET /timetable-template/:templateId
exports.getTimetableTemplateById = async (req, res) => {
  try {
    const template = await TimetableTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Timetable template not found" });
    res.json({ success: true, data: toResponse(template) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve timetable template", error: error.message });
  }
};

// PUT /timetable-template/:templateId
exports.updateTimetableTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { name, description, type, daily_periods, selected_days, max_period_duration, daily_schedule, breaks, status, modified_by } = req.body;

    const template = await TimetableTemplate.findOne({ template_id: templateId });
    if (!template) return res.status(404).json({ success: false, message: "Timetable template not found" });

    if (name                !== undefined) template.name                = name.trim();
    if (description         !== undefined) template.description         = description.trim();
    if (type                !== undefined) template.type                = type;
    if (status              !== undefined) template.status              = status;
    if (max_period_duration !== undefined) template.max_period_duration = max_period_duration;
    if (daily_periods       !== undefined) template.daily_periods       = JSON.stringify(daily_periods);
    if (selected_days       !== undefined) template.selected_days       = JSON.stringify(selected_days);
    if (daily_schedule      !== undefined) template.daily_schedule      = JSON.stringify(daily_schedule);
    if (breaks              !== undefined) template.breaks              = JSON.stringify(breaks);
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    console.log("Timetable template updated:", templateId);
    res.json({ success: true, message: "Timetable template updated successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update timetable template", error: error.message });
  }
};

// DELETE /timetable-template/:templateId
exports.deleteTimetableTemplate = async (req, res) => {
  try {
    const template = await TimetableTemplate.findOneAndDelete({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Timetable template not found" });
    res.json({ success: true, message: "Timetable template deleted successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete timetable template", error: error.message });
  }
};

// POST /timetable-template/:templateId/duplicate
exports.duplicateTimetableTemplate = async (req, res) => {
  try {
    const original = await TimetableTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Timetable template not found" });

    const { _id, ...rest } = original;
    const duplicate = await TimetableTemplate.create({
      ...rest,
      template_id:   Date.now().toString(),
      name:          `${original.name} (Copy)`,
      status:        "draft",
      created_by:    req.body.created_by || original.created_by,
      last_modified: new Date(),
      modified_by:   req.body.created_by || original.created_by,
    });

    res.status(201).json({ success: true, message: "Timetable template duplicated successfully", data: toResponse(duplicate.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to duplicate timetable template", error: error.message });
  }
};

// PATCH /timetable-template/:templateId/status
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { status, modified_by } = req.body;
    if (!["active", "draft", "archived"].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required (active, draft, or archived)" });
    }

    const template = await TimetableTemplate.findOne({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Timetable template not found" });

    template.status        = status;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    const label = status === "active" ? "activated" : status === "archived" ? "archived" : "set to draft";
    res.json({ success: true, message: `Timetable template ${label} successfully`, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update template status", error: error.message });
  }
};

module.exports = exports;
