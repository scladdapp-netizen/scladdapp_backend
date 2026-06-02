const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/student_resource.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;

const upload = multer({ storage: multer.memoryStorage() });

router.get("/student/:studentId", ctrl.getByStudent);
router.get("/:resourceId", ctrl.getById);

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "file is required" });
    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/student_resources", "auto");
    req.cloudinaryUrl      = url;
    req.cloudinaryPublicId = public_id;
    ctrl.create(req, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/:resourceId", ctrl.update);
router.patch("/:resourceId/download", ctrl.incrementDownload);

router.delete("/:resourceId", async (req, res) => {
  try {
    const r = await require("../models/StudentResource.model").findOne({ resource_id: req.params.resourceId });
    if (r?.file_public_id) await cloudinary.uploader.destroy(r.file_public_id, { resource_type: "auto" }).catch(() => {});
    ctrl.remove(req, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
