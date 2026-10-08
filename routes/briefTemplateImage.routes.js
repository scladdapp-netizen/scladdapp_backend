const express = require("express");
const jwt = require("jsonwebtoken");
const BriefTemplateImage = require("../models/BriefTemplateImage.model");

const router = express.Router();

function makeId() {
  return "bti_" + Date.now().toString() + Math.floor(Math.random() * 10000).toString();
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

router.get("/", async (req, res) => {
  try {
    const images = await BriefTemplateImage.find({})
      .sort({ created_at: -1 })
      .select("image_id label kind image created_at")
      .lean();
    return res.json({ success: true, data: images });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const label = String(req.body.label || "").trim();
    const kind = req.body.kind === "other" ? "other" : "home";
    const image = String(req.body.image || "");
    if (!label) return res.status(400).json({ success: false, message: "Name is required" });
    if (!image.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "Upload an image" });
    }
    if (image.length > 2_500_000) {
      return res.status(400).json({ success: false, message: "Image is too large" });
    }
    const doc = await BriefTemplateImage.create({
      image_id: makeId(),
      label,
      kind,
      image,
      created_by: req.jwtPayload.portal_admin_id || null,
    });
    return res.status(201).json({
      success: true,
      data: { image_id: doc.image_id, label: doc.label, kind: doc.kind, image: doc.image },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const doc = await BriefTemplateImage.findOneAndDelete({ image_id: req.params.id });
    if (!doc) return res.status(404).json({ success: false, message: "Image not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
