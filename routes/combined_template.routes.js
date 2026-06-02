const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/combined_template.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const readTemplate = (templateId) => {
  const { readData } = require("../utils/file");
  return readData("./data/combined_templates.json").find((t) => t.template_id === templateId);
};

const wrap = (action, category, descFn) => (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.created_by || req.body?.modified_by || req.body?.deleted_by || "system",
        body.data?.school_id || req.body?.school_id,
        action,
        category,
        descFn(body, req),
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  next();
};

router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", req.body.school_id, "CREATE_TEMPLATE", "Grading Template",
        `Created template "${body.data?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  ctrl.createTemplate(req, res, next);
});

router.get("/school/:schoolId", ctrl.getTemplatesBySchool);
router.get("/:templateId", ctrl.getTemplateById);
router.get("/:templateId/is-assigned", ctrl.checkIsAssigned);

router.put("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || req.body.created_by || "system", template?.school_id, "EDIT_TEMPLATE", "Grading Template",
        `Updated template "${body.data?.name || template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  ctrl.updateTemplate(req, res, next);
});

router.delete("/:templateId", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body?.deleted_by || "system", template?.school_id, "DELETE_TEMPLATE", "Grading Template",
        `Deleted template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  ctrl.deleteTemplate(req, res, next);
});

router.post("/:templateId/duplicate", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.created_by || "system", template?.school_id, "DUPLICATE_TEMPLATE", "Grading Template",
        `Duplicated template "${template?.name}"`, "success", "admin");
    }
    return originalJson(body);
  };
  ctrl.duplicateTemplate(req, res, next);
});

router.patch("/:templateId/status", (req, res, next) => {
  const template = readTemplate(req.params.templateId);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(req.body.modified_by || "system", template?.school_id, "UPDATE_TEMPLATE_STATUS", "Grading Template",
        `Changed template "${template?.name}" status to "${req.body.status}"`, "success", "admin");
    }
    return originalJson(body);
  };
  ctrl.updateTemplateStatus(req, res, next);
});

module.exports = router;
