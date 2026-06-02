const router = require("express").Router();
const announcementTemplateController = require("../controllers/announcement_template.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const readTemplate = (templateId) => {
  const { readData } = require("../utils/file");
  return readData("./data/announcement_templates.json").find((t) => t.template_id === templateId);
};

// Create a new announcement template
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", req.body.school_id, "CREATE_ANNOUNCEMENT_TEMPLATE", "Announcement Template",
        `Created announcement template "${body.data?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  announcementTemplateController.createAnnouncementTemplate(req, res, next);
});

// Get all announcement templates for a school
router.get("/school/:schoolId", announcementTemplateController.getAnnouncementTemplatesBySchool);

// Get a single announcement template by ID
router.get("/:templateId", announcementTemplateController.getAnnouncementTemplateById);

// Update an announcement template
router.put("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || req.body.created_by || "system", template?.school_id, "EDIT_ANNOUNCEMENT_TEMPLATE", "Announcement Template",
        `Updated announcement template "${body.data?.name || template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  announcementTemplateController.updateAnnouncementTemplate(req, res, next);
});

// Delete an announcement template
router.delete("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body?.deleted_by || "system", template?.school_id, "DELETE_ANNOUNCEMENT_TEMPLATE", "Announcement Template",
        `Deleted announcement template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  announcementTemplateController.deleteAnnouncementTemplate(req, res, next);
});

// Duplicate an announcement template
router.post("/:templateId/duplicate", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", template?.school_id, "DUPLICATE_ANNOUNCEMENT_TEMPLATE", "Announcement Template",
        `Duplicated announcement template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  announcementTemplateController.duplicateAnnouncementTemplate(req, res, next);
});

// Update template status
router.patch("/:templateId/status", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || "system", template?.school_id, "UPDATE_ANNOUNCEMENT_TEMPLATE_STATUS", "Announcement Template",
        `Changed announcement template "${template?.name}" status to "${req.body.status}"`, "success", "admin");
    }
    return originalJson(body);
  };
  announcementTemplateController.updateTemplateStatus(req, res, next);
});

module.exports = router;
