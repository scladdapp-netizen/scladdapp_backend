const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/staff_resource.controller");

const upload = multer({ storage: multer.memoryStorage() });

// GET all resources for a staff member
router.get("/staff/:staffId", ctrl.getByStaff);

// GET single resource
router.get("/:resourceId", ctrl.getById);

// POST create (multipart/form-data)
router.post("/", upload.single("file"), ctrl.create);

// PATCH update metadata
router.patch("/:resourceId", ctrl.update);

// PATCH increment download count
router.patch("/:resourceId/download", ctrl.incrementDownload);

// DELETE
router.delete("/:resourceId", ctrl.remove);

module.exports = router;
