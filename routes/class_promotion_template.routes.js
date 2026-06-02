const router = require("express").Router();
const classPromotionTemplateController = require("../controllers/class_promotion_template.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const readTemplate = (templateId) => {
  const { readData } = require("../utils/file");
  return readData("./data/class_promotion_templates.json").find((t) => t.template_id === templateId);
};

// Create a new class promotion template
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", req.body.school_id, "CREATE_PROMOTION_TEMPLATE", "Class Promotion Template",
        `Created class promotion template "${body.data?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  classPromotionTemplateController.createClassPromotionTemplate(req, res, next);
});

// Get all class promotion templates for a school
router.get("/school/:schoolId", classPromotionTemplateController.getClassPromotionTemplatesBySchool);

// Get classes for a school (for dropdown options)
router.get("/school/:schoolId/classes", classPromotionTemplateController.getClassesForSchool);

// Get a single class promotion template by ID
router.get("/:templateId", classPromotionTemplateController.getClassPromotionTemplateById);

// Update a class promotion template
router.put("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || req.body.created_by || "system", template?.school_id, "EDIT_PROMOTION_TEMPLATE", "Class Promotion Template",
        `Updated class promotion template "${body.data?.name || template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  classPromotionTemplateController.updateClassPromotionTemplate(req, res, next);
});

// Delete a class promotion template
router.delete("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body?.deleted_by || "system", template?.school_id, "DELETE_PROMOTION_TEMPLATE", "Class Promotion Template",
        `Deleted class promotion template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  classPromotionTemplateController.deleteClassPromotionTemplate(req, res, next);
});

// Duplicate a class promotion template
router.post("/:templateId/duplicate", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", template?.school_id, "DUPLICATE_PROMOTION_TEMPLATE", "Class Promotion Template",
        `Duplicated class promotion template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  classPromotionTemplateController.duplicateClassPromotionTemplate(req, res, next);
});

// Update template status
router.patch("/:templateId/status", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || "system", template?.school_id, "UPDATE_PROMOTION_TEMPLATE_STATUS", "Class Promotion Template",
        `Changed class promotion template "${template?.name}" status to "${req.body.status}"`, "success", "admin");
    }
    return originalJson(body);
  };
  classPromotionTemplateController.updateTemplateStatus(req, res, next);
});

module.exports = router;
