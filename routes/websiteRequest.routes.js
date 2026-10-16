const router = require("express").Router();
const multer = require("multer");
const ctrl   = require("../controllers/websiteRequest.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get   ("/:schoolId/website-request",          ctrl.get);
router.patch ("/:schoolId/website-request",          ctrl.saveDraft);          // JSON body
router.post  ("/:schoolId/website-request/submit",   ctrl.submit);
router.post(
  "/:schoolId/website-request/publish",
  upload.fields([
    { name: "html_file", maxCount: 1 },
    { name: "html_files", maxCount: 40 },
  ]),
  ctrl.publish
);
router.get   ("/:schoolId/website-request/pages",    ctrl.getPages);           // published HTML (portal admin)
router.put   ("/:schoolId/website-request/pages",    ctrl.savePage);           // save one page (portal admin)
router.delete("/:schoolId/website-request",          ctrl.cancel);
router.delete("/:schoolId/website-request/purge",    ctrl.purge);
router.post  ("/:schoolId/website-request/custom-domain",        ctrl.setCustomDomain);
router.post  ("/:schoolId/website-request/custom-domain/verify", ctrl.verifyCustomDomain);
router.delete("/:schoolId/website-request/custom-domain",        ctrl.removeCustomDomain);

module.exports = router;
