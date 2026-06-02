const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/class_resource.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/class/:classId", ctrl.getByClass);
router.get("/:resourceId", ctrl.getById);

router.post("/", upload.single("file"), (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.uploaded_by || "system",
        req.body.school_id,
        "UPLOAD_CLASS_RESOURCE",
        "Class Resources",
        `Uploaded resource "${req.body.name}" for class ${req.body.class_id}`,
        "success",
        "staff"
      );
    }
    return originalJson(body);
  };
  ctrl.create(req, res, next);
});

router.patch("/:resourceId/download", ctrl.incrementDownload);

const ClassResource = require("../models/ClassResource.model");

router.delete("/:resourceId", async (req, res, next) => {
  const resource = await ClassResource.findOne({ resource_id: req.params.resourceId }).lean();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        resource?.school_id,
        "DELETE_CLASS_RESOURCE",
        "Class Resources",
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
