const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const ctrl    = require("../controllers/subject_resource.controller");
const { logActivity } = require("../controllers/staff_activity.controller");
const SubjectResource = require("../models/SubjectResource.model");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/subject/:subjectId", ctrl.getBySubject);
router.get("/:resourceId",        ctrl.getById);

router.post("/", upload.single("file"), async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.uploaded_by_id || "system",
        req.body.school_id,
        "UPLOAD_SUBJECT_RESOURCE",
        "Subject Resources",
        `Uploaded resource "${req.body.name}" for subject ${req.body.subject_id}`,
        "success",
        "staff"
      );
    }
    return originalJson(body);
  };
  ctrl.create(req, res, next);
});

router.patch("/:resourceId", async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (body?.success) {
      const resource = await SubjectResource.findOne({ resource_id: req.params.resourceId }).lean();
      logActivity(
        req.body.modified_by || "system",
        resource?.school_id,
        "EDIT_SUBJECT_RESOURCE",
        "Subject Resources",
        `Updated resource "${body.data?.name || resource?.name}"`,
        "success",
        "staff"
      );
    }
    return originalJson(body);
  };
  ctrl.update(req, res, next);
});

router.patch("/:resourceId/download", ctrl.incrementDownload);

router.delete("/:resourceId", async (req, res, next) => {
  const resource = await SubjectResource.findOne({ resource_id: req.params.resourceId }).lean();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        resource?.school_id,
        "DELETE_SUBJECT_RESOURCE",
        "Subject Resources",
        `Deleted resource "${resource?.name}"`,
        "success",
        "staff"
      );
    }
    return originalJson(body);
  };
  ctrl.remove(req, res, next);
});

module.exports = router;
