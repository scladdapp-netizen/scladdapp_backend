const WebsiteRequest   = require("../models/WebsiteRequest.model");
const School           = require("../models/School.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary       = require("cloudinary").v2;

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Turn a school name into a URL-safe slug
 * e.g. "Green Valley School" → "greenvalleyschool"
 */
const toSlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 50);

/**
 * Build the public-facing site URL based on environment
 *   dev  → http://localhost:<PORT>/sites/<slug>
 *   prod → https://<slug>.<PROD_DOMAIN>
 */
const buildSiteUrl = (slug) => {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return `https://${slug}.${process.env.PROD_DOMAIN}`;
  }
  const base = process.env.DEV_BASE_URL || `http://localhost:${process.env.PORT || 1234}`;
  return `${base}/sites/${slug}`;
};

// GET  /api/schools/:schoolId/website-request
exports.get = async (req, res) => {
  try {
    const doc = await WebsiteRequest.findOne({ school_id: req.params.schoolId }).lean();
    res.json({ success: true, data: doc || null });
  } catch (err) {
    console.error("[websiteRequest.get error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH  /api/schools/:schoolId/website-request  (save brief draft — JSON body)
exports.saveDraft = async (req, res) => {
  try {
    const { schoolId } = req.params;

    // Block if already submitted
    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (existing && existing.status === "submitted") {
      return res.status(400).json({ success: false, message: "Already submitted and locked." });
    }

    // Accept partial brief fields from body
    const { primary_color, secondary_color, font_style, theme, sections, final_notes } = req.body;

    const briefUpdate = {};
    if (primary_color   !== undefined) briefUpdate["brief.primary_color"]   = primary_color;
    if (secondary_color !== undefined) briefUpdate["brief.secondary_color"] = secondary_color;
    if (font_style      !== undefined) briefUpdate["brief.font_style"]      = font_style;
    if (theme           !== undefined) briefUpdate["brief.theme"]           = theme;
    if (sections        !== undefined) briefUpdate["brief.sections"]        = sections;
    if (final_notes     !== undefined) briefUpdate["brief.final_notes"]     = final_notes;

    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      { $set: { ...briefUpdate, school_id: schoolId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false }
    );

    // Mark school as having a pending request
    await School.updateOne({ school_id: schoolId }, { $set: { website_requested: true, updated_at: new Date() } });

    res.json({ success: true, data: doc, message: "Draft saved" });
  } catch (err) {
    console.error("[saveDraft error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST  /api/schools/:schoolId/website-request/submit
exports.submit = async (req, res) => {
  try {
    const { schoolId } = req.params;

    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (existing && existing.status === "submitted") {
      return res.status(400).json({ success: false, message: "Already submitted and locked." });
    }

    // Must have at least the default sections before submitting
    if (!existing || !existing.brief || !existing.brief.sections || existing.brief.sections.length === 0) {
      return res.status(400).json({ success: false, message: "Please complete at least Step 2 (Sections) before submitting." });
    }

    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      { $set: { status: "submitted", submitted_at: new Date() } },
      { new: true }
    );

    await School.updateOne({ school_id: schoolId }, { $set: { website_requested: true, updated_at: new Date() } });

    res.json({ success: true, data: doc, message: "Website brief submitted! We'll be in touch soon." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE  /api/schools/:schoolId/website-request  (cancel – only if draft)
exports.cancel = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const doc = await WebsiteRequest.findOne({ school_id: schoolId });
    if (doc && doc.status === "submitted") {
      return res.status(400).json({ success: false, message: "Submitted brief cannot be cancelled." });
    }
    if (doc) {
      await WebsiteRequest.deleteOne({ school_id: schoolId });
    }
    await School.updateOne({ school_id: schoolId }, { $set: { website_requested: false, updated_at: new Date() } });
    res.json({ success: true, message: "Request cancelled." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST  /api/schools/:schoolId/website-request/publish  (admin only — upload index.html)
exports.publish = async (req, res) => {
  try {
    const { schoolId } = req.params;

    // Must have an HTML file
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No HTML file provided." });
    }

    if (!req.file.originalname.endsWith(".html")) {
      return res.status(400).json({ success: false, message: "Only .html files are accepted." });
    }

    // Must have a website request doc
    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No website request found for this school." });
    }

    // Fetch the school to build the slug
    const school = await School.findOne({ school_id: schoolId });
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found." });
    }

    // Build slug from school name — fallback to schoolId if name is missing
    const slug = toSlug(school.school_name) || schoolId;

    // Delete old HTML from Cloudinary if it exists
    if (existing.html_cloudinary_url) {
      try {
        // Derive the public_id from the stored URL
        // Cloudinary public_id is everything after /upload/vXXXXX/ and before the extension
        const urlParts = existing.html_cloudinary_url.split("/upload/");
        if (urlParts[1]) {
          const withoutVersion = urlParts[1].replace(/^v\d+\//, "");
          const publicId = withoutVersion.replace(/\.[^/.]+$/, ""); // remove extension
          await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
        }
      } catch (_) { /* non-fatal — old file cleanup failure shouldn't block publish */ }
    }

    // Upload the new HTML file to Cloudinary as raw
    const { url: htmlCloudinaryUrl } = await uploadToCloudinary(
      req.file.buffer,
      `scladapp/websites/${schoolId}`,
      "raw"
    );

    // Build the public-facing URL (dev path or prod subdomain)
    const siteUrl = buildSiteUrl(slug);

    // Update WebsiteRequest
    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          status:                        "published",
          subdomain_slug:                slug,
          html_cloudinary_url:           htmlCloudinaryUrl,
          scladapp_website_url:          siteUrl,
          scladapp_website_published_at: new Date(),
        },
      },
      { new: true }
    );

    // Update School.website so it appears everywhere website is shown
    await School.updateOne(
      { school_id: schoolId },
      { $set: { website: siteUrl, updated_at: new Date() } }
    );

    res.json({ success: true, data: doc, message: "Website published.", site_url: siteUrl });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET  /sites/:slug  (serves the hosted school website — dev mode path-based)
exports.serveSchoolSite = async (req, res) => {
  try {
    const { slug } = req.params;

    const doc = await WebsiteRequest.findOne({ subdomain_slug: slug, status: "published" });
    if (!doc || !doc.html_cloudinary_url) {
      return res.status(404).send("<h1>Site not found</h1>");
    }

    // Fetch the HTML from Cloudinary and proxy it to the browser
    const response = await fetch(doc.html_cloudinary_url);
    if (!response.ok) {
      return res.status(502).send("<h1>Could not load site content</h1>");
    }

    const html = await response.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).send("<h1>Server error</h1>");
  }
};
