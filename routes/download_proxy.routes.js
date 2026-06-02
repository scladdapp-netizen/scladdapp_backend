/**
 * GET /api/download-proxy?url=<encoded_cloudinary_url>&name=<filename>
 *
 * Fetches any Cloudinary file server-side and streams it to the client
 * with correct Content-Type and Content-Disposition headers.
 * Bypasses browser CORS restrictions on Cloudinary raw files.
 */
const express = require("express");
const https   = require("https");
const http    = require("http");
const router  = express.Router();

const MIME_MAP = {
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  svg:  "image/svg+xml",
  txt:  "text/plain",
  csv:  "text/csv",
  zip:  "application/zip",
  rar:  "application/x-rar-compressed",
};

router.get("/", (req, res) => {
  const { url, name } = req.query;

  if (!url) return res.status(400).json({ success: false, message: "url is required" });

  let fetchUrl;
  try {
    fetchUrl = decodeURIComponent(url);
  } catch {
    return res.status(400).json({ success: false, message: "Invalid url" });
  }

  const fileName = name ? decodeURIComponent(name) : "download";
  const ext      = fileName.split(".").pop().toLowerCase();
  const mimeType = MIME_MAP[ext] || "application/octet-stream";

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  const lib = fetchUrl.startsWith("https") ? https : http;
  lib.get(fetchUrl, (upstream) => {
    if (upstream.statusCode !== 200) {
      return res.status(502).json({ success: false, message: `Storage returned ${upstream.statusCode}` });
    }
    upstream.pipe(res);
  }).on("error", (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

module.exports = router;
