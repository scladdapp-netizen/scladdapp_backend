const express = require("express");
const router  = require("express").Router();
const multer  = require("multer");
const ctrl    = require("../controllers/staff_credential.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/staff/:staffId",        ctrl.getByStaff);
router.get("/:credentialId",         ctrl.getById);
router.post("/",  upload.single("file"), ctrl.create);
router.patch("/:credentialId",       ctrl.update);
router.patch("/:credentialId/download", ctrl.incrementDownload);
router.delete("/:credentialId",      ctrl.remove);

module.exports = router;
