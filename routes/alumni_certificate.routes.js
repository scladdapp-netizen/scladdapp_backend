const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/alumni_certificate.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

const upload = multer({ dest: "temp/" });

router.get("/alumni/:alumniId", ctrl.getByAlumni);
router.get("/:certificateId", ctrl.getById);

router.post("/", upload.single("file"), (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.uploaded_by_id || "system",
        req.body.school_id,
        "UPLOAD_CERTIFICATE",
        "Graduate Certificate",
        `Uploaded certificate "${body.data?.name}" for alumni ${req.body.alumni_id}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.upload(req, res, next);
});

router.patch("/:certificateId/status", (req, res, next) => {
  const { readData } = require("../utils/file");
  const path = require("path");
  const certs = readData(path.join(__dirname, "../data/alumni_certificates.json"));
  const cert = certs.find((c) => c.certificate_id === req.params.certificateId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || "system",
        cert?.school_id,
        "UPDATE_CERTIFICATE_STATUS",
        "Graduate Certificate",
        `Changed certificate "${cert?.name}" status to "${req.body.status}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.updateStatus(req, res, next);
});

router.delete("/:certificateId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const path = require("path");
  const certs = readData(path.join(__dirname, "../data/alumni_certificates.json"));
  const cert = certs.find((c) => c.certificate_id === req.params.certificateId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        cert?.school_id,
        "DELETE_CERTIFICATE",
        "Graduate Certificate",
        `Deleted certificate "${cert?.name}" for alumni ${cert?.alumni_id}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.remove(req, res, next);
});

module.exports = router;
