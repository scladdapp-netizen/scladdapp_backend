const path = require("path");
const fs   = require("fs");
const jwt  = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const { uploadToCloudinary } = require("../utils/cloudinary");

const DOCS_PATH = path.join(__dirname, "../data/docsContent.json");
const DOCS_IMAGE_FOLDER = "scladapp/docs/images";
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

function readDocsFile() {
  const raw = fs.readFileSync(DOCS_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDocsFile(data) {
  fs.writeFileSync(DOCS_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function validateBlock(block, context) {
  if (!block || typeof block !== "object" || !block.type) {
    throw new Error(`${context}: each block must have a type`);
  }

  if (block.type === "paragraph") {
    if (!block.text || typeof block.text !== "string") {
      throw new Error(`${context}: paragraph blocks need text`);
    }
    return;
  }

  if (block.type === "video") {
    if (!block.youtubeId || typeof block.youtubeId !== "string") {
      throw new Error(`${context}: video blocks need a YouTube ID or URL`);
    }
    return;
  }

  if (block.type === "image") {
    if (!block.url || typeof block.url !== "string") {
      throw new Error(`${context}: image blocks need a URL`);
    }
    return;
  }

  throw new Error(`${context}: unsupported block type "${block.type}"`);
}

function validateBlocks(blocks, context) {
  if (!blocks) return;
  if (!Array.isArray(blocks)) {
    throw new Error(`${context} blocks must be an array`);
  }
  for (const block of blocks) {
    validateBlock(block, context);
  }
}

function validateDocsContent(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Docs content must be a non-empty array");
  }

  const ids = new Set();

  for (const section of data) {
    if (!section?.section || typeof section.section !== "string") {
      throw new Error("Each section must have a section name");
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      throw new Error(`Section "${section.section}" must have at least one topic`);
    }

    for (const item of section.items) {
      if (!item?.id || !item?.title || !item?.content) {
        throw new Error("Each topic must have id, title, and content");
      }
      if (ids.has(item.id)) {
        throw new Error(`Duplicate topic id: ${item.id}`);
      }
      ids.add(item.id);

      if (item.steps !== undefined && item.steps !== null && !Array.isArray(item.steps)) {
        throw new Error(`Topic "${item.id}" steps must be an array`);
      }

      validateBlocks(item.blocks, `Topic "${item.id}"`);

      for (const step of item.steps || []) {
        if (!step?.step) {
          throw new Error(`Topic "${item.id}" steps must have a step title`);
        }
        validateBlocks(step.blocks, `Topic "${item.id}" step "${step.step}"`);
      }

      if (item.video !== undefined && item.video !== null) {
        if (typeof item.video !== "object" || !item.video.title || !item.video.youtubeId) {
          throw new Error(`Topic "${item.id}" video must have title and youtubeId, or be null`);
        }
      }
    }
  }
}

function verifyAdminToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

exports.verifyAdminToken = verifyAdminToken;

exports.getDocsContent = (req, res) => {
  try {
    const data = readDocsFile();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[DOCS] Failed to load docs content:", err.message);
    return res.status(500).json({ success: false, message: "Could not load documentation" });
  }
};

exports.updateDocsContent = (req, res) => {
  const tag = "[DOCS-UPDATE]";
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, message: "data is required" });
    }

    validateDocsContent(data);
    writeDocsFile(data);

    console.log(`${tag} Updated docs (${data.length} sections) by ${req.jwtPayload?.portal_admin_id || "admin"}`);
    return res.json({ success: true, data, message: "Documentation updated" });
  } catch (err) {
    console.error(`${tag} Error:`, err.message);
    const status = err.message.includes("must") || err.message.includes("Duplicate") ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message || "Could not save documentation" });
  }
};

exports.uploadDocsImage = async (req, res) => {
  const tag = "[DOCS-IMG-UPLOAD]";
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    if (!ALLOWED_IMAGE_MIMES.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: "Only image files are allowed (jpg, png, webp, gif, svg)." });
    }

    const oldPublicId = req.body?.oldPublicId?.trim() || null;
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image" });
        console.log(`${tag} Deleted old image: ${oldPublicId}`);
      } catch (delErr) {
        console.warn(`${tag} Could not delete old image ${oldPublicId}: ${delErr.message}`);
      }
    }

    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      DOCS_IMAGE_FOLDER,
      "image",
      req.file.originalname
    );

    console.log(`${tag} Uploaded: ${public_id}`);
    return res.json({ success: true, url, public_id });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Upload failed." });
  }
};

exports.deleteDocsImage = async (req, res) => {
  const tag = "[DOCS-IMG-DELETE]";
  try {
    const publicId = req.body?.public_id?.trim() || null;
    if (!publicId) {
      return res.status(400).json({ success: false, message: "public_id is required." });
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    console.log(`${tag} Deleted: ${publicId}`);
    return res.json({ success: true, message: "Image deleted." });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Delete failed." });
  }
};
