const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const {
  getDocsContent,
  updateDocsContent,
  uploadDocsImage,
  deleteDocsImage,
  verifyAdminToken,
} = require("../controllers/docs.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// GET /api/docs — public
router.get("/", getDocsContent);

// PUT /api/docs — portal admin only
router.put("/", verifyAdminToken, updateDocsContent);

// POST /api/docs/upload-image — portal admin only
router.post("/upload-image", verifyAdminToken, upload.single("image"), uploadDocsImage);

// DELETE /api/docs/delete-image — portal admin only
router.delete("/delete-image", verifyAdminToken, deleteDocsImage);

module.exports = router;
