const router = require("express").Router();
const timetableTemplateController = require("../controllers/timetable_template.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const readTemplate = (templateId) => {
  const { readData } = require("../utils/file");
  return readData("./data/timetable_templates.json").find((t) => t.template_id === templateId);
};

// Create a new timetable template
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", req.body.school_id, "CREATE_TIMETABLE_TEMPLATE", "Timetable Template",
        `Created timetable template "${body.data?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  timetableTemplateController.createTimetableTemplate(req, res, next);
});

// Get all timetable templates for a school
router.get("/school/:schoolId", timetableTemplateController.getTimetableTemplatesBySchool);

// Get a single timetable template by ID
router.get("/:templateId", timetableTemplateController.getTimetableTemplateById);

// Update a timetable template
router.put("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || req.body.created_by || "system", template?.school_id, "EDIT_TIMETABLE_TEMPLATE", "Timetable Template",
        `Updated timetable template "${body.data?.name || template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  timetableTemplateController.updateTimetableTemplate(req, res, next);
});

// Delete a timetable template
router.delete("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body?.deleted_by || "system", template?.school_id, "DELETE_TIMETABLE_TEMPLATE", "Timetable Template",
        `Deleted timetable template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  timetableTemplateController.deleteTimetableTemplate(req, res, next);
});

// Duplicate a timetable template
router.post("/:templateId/duplicate", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", template?.school_id, "DUPLICATE_TIMETABLE_TEMPLATE", "Timetable Template",
        `Duplicated timetable template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  timetableTemplateController.duplicateTimetableTemplate(req, res, next);
});

// Update template status
router.patch("/:templateId/status", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || "system", template?.school_id, "UPDATE_TIMETABLE_TEMPLATE_STATUS", "Timetable Template",
        `Changed timetable template "${template?.name}" status to "${req.body.status}"`, "success", "admin");
    }
    return originalJson(body);
  };
  timetableTemplateController.updateTemplateStatus(req, res, next);
});

module.exports = router;
