const express = require("express");
const multer = require("multer");
const ctrl = require("../controllers/applicationForm.controller");
const { APPLICATION_FORM_SECTIONS } = require("../data/applicationFormFields");

const router = express.Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const fileFields = APPLICATION_FORM_SECTIONS
  .flatMap((s) => s.fields.filter((f) => f.type === "file").map((f) => ({ name: f.id, maxCount: 1 })));

// Public
router.get("/public", ctrl.getPublicForm);
router.post("/submit", upload.fields(fileFields), ctrl.submitApplication);
router.post("/verify-email/send", ctrl.sendEmailVerificationOtp);
router.post("/verify-email/verify", ctrl.verifyEmailVerificationOtp);

// Admin
router.get("/config", ctrl.verifyToken, ctrl.getAdminConfig);
router.patch("/config", ctrl.verifyToken, ctrl.updateAdminConfig);
router.get("/applications/unseen-count", ctrl.verifyToken, ctrl.getUnseenCount);
router.get("/applications", ctrl.verifyToken, ctrl.listApplications);
router.get("/applications/:applicationId", ctrl.verifyToken, ctrl.getApplication);
router.patch("/applications/:applicationId", ctrl.verifyToken, ctrl.updateApplicationStatus);

module.exports = router;
