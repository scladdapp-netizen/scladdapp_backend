const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("../controllers/teacher_resource.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/teacher/:teacherId", ctrl.getByTeacher);
router.get("/:resourceId", ctrl.getById);
router.post("/", upload.single("file"), ctrl.create);
router.patch("/:resourceId/download", ctrl.incrementDownload);
router.delete("/:resourceId", ctrl.remove);

module.exports = router;
