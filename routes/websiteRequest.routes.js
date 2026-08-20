const router = require("express").Router();
const multer = require("multer");
const ctrl   = require("../controllers/websiteRequest.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get   ("/:schoolId/website-request",          ctrl.get);
router.patch ("/:schoolId/website-request",          ctrl.saveDraft);          // JSON body
router.post  ("/:schoolId/website-request/submit",   ctrl.submit);
router.post  ("/:schoolId/website-request/publish",  upload.single("html_file"), ctrl.publish);
router.delete("/:schoolId/website-request",          ctrl.cancel);

module.exports = router;
