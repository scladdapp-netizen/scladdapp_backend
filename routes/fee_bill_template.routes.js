const express = require("express");
const router = express.Router();
const feeBillTemplateController = require("../controllers/fee_bill_template.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const readTemplate = (templateId) => {
  const { readData } = require("../utils/file");
  return readData("./data/fee_bill_templates.json").find((t) => t.template_id === templateId);
};

// Create a new fee bill template
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", req.body.school_id, "CREATE_FEE_TEMPLATE", "Fee Bill Template",
        `Created fee bill template "${body.data?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  feeBillTemplateController.createFeeBillTemplate(req, res, next);
});

// Get all fee bill templates for a school
router.get("/school/:schoolId", feeBillTemplateController.getFeeBillTemplatesBySchool);

// Get a single fee bill template by ID
router.get("/:templateId", feeBillTemplateController.getFeeBillTemplateById);

// Update a fee bill template
router.put("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || req.body.created_by || "system", template?.school_id, "EDIT_FEE_TEMPLATE", "Fee Bill Template",
        `Updated fee bill template "${body.data?.name || template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  feeBillTemplateController.updateFeeBillTemplate(req, res, next);
});

// Delete a fee bill template
router.delete("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body?.deleted_by || "system", template?.school_id, "DELETE_FEE_TEMPLATE", "Fee Bill Template",
        `Deleted fee bill template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  feeBillTemplateController.deleteFeeBillTemplate(req, res, next);
});

// Duplicate a fee bill template
router.post("/:templateId/duplicate", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", template?.school_id, "DUPLICATE_FEE_TEMPLATE", "Fee Bill Template",
        `Duplicated fee bill template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  feeBillTemplateController.duplicateFeeBillTemplate(req, res, next);
});

// Update template status
router.patch("/:templateId/status", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || "system", template?.school_id, "UPDATE_FEE_TEMPLATE_STATUS", "Fee Bill Template",
        `Changed fee bill template "${template?.name}" status to "${req.body.status}"`, "success", "admin");
    }
    return originalJson(body);
  };
  feeBillTemplateController.updateTemplateStatus(req, res, next);
});

module.exports = router;
