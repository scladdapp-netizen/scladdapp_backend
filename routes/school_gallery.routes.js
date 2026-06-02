const router = require("express").Router();
const multer = require("multer");
const ctrl = require("../controllers/school_gallery.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;
const SchoolGallery = require("../models/SchoolGallery.model");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/:schoolId", ctrl.getBySchool);

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "file is required" });
    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/school_gallery", "image");
    req.cloudinaryUrl      = url;
    req.cloudinaryPublicId = public_id;
    ctrl.create(req, res);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete("/:galleryId", async (req, res) => {
  try {
    const item = await SchoolGallery.findOne({ gallery_id: req.params.galleryId });
    if (item?.file_public_id) await cloudinary.uploader.destroy(item.file_public_id, { resource_type: "image" }).catch(() => {});
    ctrl.remove(req, res);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
