/**
 * AI Website Edit Routes
 * ----------------------
 * All routes require a valid school JWT (user must be logged in).
 *
 * GET    /api/schools/:schoolId/ai-website/tokens         — get school token balance
 * GET    /api/schools/:schoolId/ai-website/models         — list available AI models
 * POST   /api/schools/:schoolId/ai-website/edit           — run an AI edit
 * GET    /api/schools/:schoolId/ai-website/live           — get live published HTML
 * GET    /api/schools/:schoolId/ai-website/draft          — get saved draft HTML
 * PATCH  /api/schools/:schoolId/ai-website/draft          — save draft HTML
 * POST   /api/schools/:schoolId/ai-website/upload-image   — upload image to Cloudinary
 * DELETE /api/schools/:schoolId/ai-website/delete-image   — delete image from Cloudinary
 */

const express = require("express");
const jwt     = require("jsonwebtoken");
const multer  = require("multer");
const ctrl    = require("../controllers/aiWebsiteEdit.controller");

const router  = express.Router({ mergeParams: true });
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── middleware: verify school JWT ───────────────────────────────────────────
function verifyToken(req, res, next) {
  const tag    = "[AI-WEB-AUTH]";
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    console.warn(`${tag} No token`);
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.warn(`${tag} Invalid token — ${err.message}`);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

router.get    ("/:schoolId/ai-website/tokens",       verifyToken, ctrl.getTokenBalance);
router.get    ("/:schoolId/ai-website/models",       verifyToken, ctrl.getAvailableModels);
router.post   ("/:schoolId/ai-website/edit",         verifyToken, ctrl.editWebsite);
router.get    ("/:schoolId/ai-website/live",         verifyToken, ctrl.getLiveHtml);
router.get    ("/:schoolId/ai-website/draft",        verifyToken, ctrl.getDraft);
router.patch  ("/:schoolId/ai-website/draft",        verifyToken, ctrl.saveDraft);
router.post   ("/:schoolId/ai-website/upload-image", verifyToken, upload.single("image"), ctrl.uploadImage);
router.delete ("/:schoolId/ai-website/delete-image", verifyToken, ctrl.deleteImage);

module.exports = router;
