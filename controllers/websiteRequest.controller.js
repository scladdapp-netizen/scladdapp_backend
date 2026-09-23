const WebsiteRequest   = require("../models/WebsiteRequest.model");
const School           = require("../models/School.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { buildSiteUrl, rewriteStoredSiteUrl } = require("../utils/siteUrl");
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

const normalizePathSlug = (pathOrSlug) => {
  if (!pathOrSlug || pathOrSlug === "" || pathOrSlug === "index" || pathOrSlug === "index.html") return "/";
  let s = String(pathOrSlug).trim();
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/+$/, "") || "/";
  s = s.replace(/\.html$/i, "");
  return s === "" ? "/" : s;
};

const slugToFilename = (slug) => {
  const n = normalizePathSlug(slug);
  if (n === "/") return "index.html";
  return `${n.replace(/^\//, "").replace(/\//g, "-")}.html`;
};

const filenameToSlug = (filename) => {
  const base = String(filename || "").replace(/\.html$/i, "");
  if (!base || base === "index") return "/";
  return normalizePathSlug(base.replace(/-/g, "/"));
};

const extractRawPublicIdFromUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  try {
    const parts = url.split("/upload/");
    if (!parts[1]) return null;
    // Keep extension — Cloudinary raw public_ids usually include ".html"
    return decodeURIComponent(parts[1].replace(/^v\d+\//, "").split("?")[0]);
  } catch (_) {
    return null;
  }
};

/**
 * Delete a previously published HTML asset from Cloudinary (raw).
 * Tries public_id first, then URL-derived id (with and without extension).
 */
const destroyCloudinaryRawAsset = async ({ url, publicId, resourceType = "raw" } = {}) => {
  const candidates = [];
  if (publicId) candidates.push(publicId);
  const fromUrl = extractRawPublicIdFromUrl(url);
  if (fromUrl) {
    candidates.push(fromUrl);
    const noExt = fromUrl.replace(/\.[^/.]+$/, "");
    if (noExt && noExt !== fromUrl) candidates.push(noExt);
  }

  const tried = new Set();
  for (const id of candidates) {
    if (!id || tried.has(id)) continue;
    tried.add(id);
    try {
      const result = await cloudinary.uploader.destroy(id, {
        resource_type: resourceType,
        invalidate: true,
      });
      console.log(`[publish] Cloudinary destroy "${id}" → ${result?.result || "unknown"}`);
      if (result?.result === "ok" || result?.result === "not found") return true;
    } catch (err) {
      console.warn(`[publish] Cloudinary destroy failed for "${id}": ${err.message}`);
    }
  }
  return false;
};

/** Collect and delete every previously published HTML file for this request */
const deletePreviousPublishedHtml = async (existing) => {
  if (!existing) return 0;
  const assets = [];
  if (Array.isArray(existing.published_pages)) {
    for (const p of existing.published_pages) {
      if (p?.html_cloudinary_url || p?.html_cloudinary_public_id) {
        assets.push({
          url: p.html_cloudinary_url,
          publicId: p.html_cloudinary_public_id,
        });
      }
    }
  }
  if (existing.html_cloudinary_url || existing.html_cloudinary_public_id) {
    assets.push({
      url: existing.html_cloudinary_url,
      publicId: existing.html_cloudinary_public_id,
    });
  }

  // De-dupe by url/publicId
  const seen = new Set();
  let deleted = 0;
  for (const asset of assets) {
    const key = `${asset.publicId || ""}|${asset.url || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ok = await destroyCloudinaryRawAsset(asset);
    if (ok) deleted += 1;
  }
  console.log(`[publish] Removed ${deleted}/${seen.size} previous published HTML asset(s)`);
  return deleted;
};

/**
 * Wipe every Cloudinary asset stored under this school's website folder.
 * Published pages are uploaded as "raw", brief/editor images as "image".
 */
const purgeWebsiteFolder = async (schoolId) => {
  const prefix = `scladapp/websites/${schoolId}`;
  let deleted = 0;

  for (const resourceType of ["raw", "image", "video"]) {
    try {
      const result = await cloudinary.api.delete_resources_by_prefix(prefix, {
        resource_type: resourceType,
        invalidate: true,
      });
      deleted += Object.values(result?.deleted || {}).filter((v) => v === "deleted").length;
    } catch (err) {
      console.warn(`[purge] prefix delete failed (${resourceType}): ${err.message}`);
    }
  }

  // Folders only disappear once they are empty, and may not exist at all.
  for (const folder of [`${prefix}/editor-images`, prefix]) {
    try {
      await cloudinary.api.delete_folder(folder);
    } catch (_) {}
  }

  console.log(`[purge] Removed ${deleted} Cloudinary asset(s) under ${prefix}`);
  return deleted;
};

// GET  /api/schools/:schoolId/website-request
exports.get = async (req, res) => {
  try {
    const doc = await WebsiteRequest.findOne({ school_id: req.params.schoolId }).lean();
    if (doc?.scladapp_website_url) {
      doc.scladapp_website_url = rewriteStoredSiteUrl(doc.scladapp_website_url);
    }
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
    const { primary_color, secondary_color, background_color, font_style, theme, pages, sections, final_notes } = req.body;

    const briefUpdate = {};
    if (primary_color    !== undefined) briefUpdate["brief.primary_color"]    = primary_color;
    if (secondary_color  !== undefined) briefUpdate["brief.secondary_color"]  = secondary_color;
    if (background_color !== undefined) briefUpdate["brief.background_color"] = background_color;
    if (font_style       !== undefined) briefUpdate["brief.font_style"]       = font_style;
    if (theme           !== undefined) briefUpdate["brief.theme"]           = theme;
    if (pages           !== undefined) briefUpdate["brief.pages"]           = pages;
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

    // Must have at least one page with sections (or legacy flat sections)
    const pages = existing?.brief?.pages || [];
    const legacySections = existing?.brief?.sections || [];
    const hasPages = pages.some((p) => Array.isArray(p.sections) && p.sections.length > 0);
    const hasLegacy = legacySections.length > 0;
    if (!existing || !existing.brief || (!hasPages && !hasLegacy)) {
      return res.status(400).json({ success: false, message: "Please complete at least Step 2 (Pages) before submitting." });
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

// DELETE  /api/schools/:schoolId/website-request/purge  (admin hard reset)
// Drops every Cloudinary asset and the request itself, whatever its status,
// leaving the school exactly as if it had never asked for a website.
exports.purge = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const existing = await WebsiteRequest.findOne({ school_id: schoolId });

    await deletePreviousPublishedHtml(existing);

    if (existing?.reference_image_url) {
      await destroyCloudinaryRawAsset({ url: existing.reference_image_url, resourceType: "image" });
    }
    if (existing?.description_doc_url) {
      await destroyCloudinaryRawAsset({ url: existing.description_doc_url });
    }

    const assetsDeleted = await purgeWebsiteFolder(schoolId);

    await WebsiteRequest.deleteOne({ school_id: schoolId });
    await School.updateOne(
      { school_id: schoolId },
      { $set: { website: null, website_requested: false, updated_at: new Date() } }
    );

    res.json({
      success: true,
      message: "Website request deleted and Cloudinary assets removed.",
      assets_deleted: assetsDeleted,
    });
  } catch (err) {
    console.error("[websiteRequest.purge error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST  /api/schools/:schoolId/website-request/publish
// Accepts:
//   - single file field "html_file" (legacy home page)
//   - multiple files field "html_files" + optional "pages_json"
exports.publish = async (req, res) => {
  try {
    const { schoolId } = req.params;

    const files = [];
    if (req.files && typeof req.files === "object" && !Array.isArray(req.files)) {
      if (Array.isArray(req.files.html_files)) files.push(...req.files.html_files);
      if (Array.isArray(req.files.html_file)) files.push(...req.files.html_file);
    } else if (Array.isArray(req.files)) {
      files.push(...req.files);
    } else if (req.file) {
      files.push(req.file);
    }

    if (!files.length) {
      return res.status(400).json({ success: false, message: "No HTML file(s) provided." });
    }

    const htmlFiles = files.filter((f) => (f.originalname || "").toLowerCase().endsWith(".html"));
    if (!htmlFiles.length) {
      return res.status(400).json({ success: false, message: "Only .html files are accepted." });
    }

    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No website request found for this school." });
    }

    const school = await School.findOne({ school_id: schoolId });
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found." });
    }

    const slug = toSlug(school.school_name) || schoolId;

    let pagesMeta = [];
    try {
      if (req.body?.pages_json) pagesMeta = JSON.parse(req.body.pages_json);
    } catch (_) {}

    const briefPages = existing.brief?.pages || [];
    if (!pagesMeta.length && briefPages.length) {
      pagesMeta = briefPages.map((p, i) => ({
        id: p.id || `page_${i}`,
        title: p.title || `Page ${i + 1}`,
        slug: p.slug || (i === 0 ? "/" : `/${p.id}`),
        order: p.order ?? i,
      }));
    }
    if (!pagesMeta.length) {
      pagesMeta = [{ id: "home", title: "Home", slug: "/", order: 0 }];
    }

    // Always delete previous published HTML from Cloudinary before uploading new files
    await deletePreviousPublishedHtml(existing);

    // Clear live pointers so old pages can't be served mid-republish
    await WebsiteRequest.updateOne(
      { school_id: schoolId },
      {
        $set: {
          published_pages: [],
          html_cloudinary_url: null,
          html_cloudinary_public_id: null,
        },
      }
    );

    const publishedPages = [];
    for (let i = 0; i < htmlFiles.length; i++) {
      const file = htmlFiles[i];
      const metaFromName = pagesMeta.find((p) => slugToFilename(p.slug) === file.originalname)
        || pagesMeta.find((p) => p.id === file.fieldname)
        || pagesMeta[i]
        || {
          id: `page_${i}`,
          title: file.originalname.replace(/\.html$/i, ""),
          slug: filenameToSlug(file.originalname),
          order: i,
        };

      const { url: htmlCloudinaryUrl, public_id: htmlPublicId } = await uploadToCloudinary(
        file.buffer,
        `scladapp/websites/${schoolId}`,
        "raw",
        file.originalname || slugToFilename(metaFromName.slug)
      );

      publishedPages.push({
        id: metaFromName.id || `page_${i}`,
        title: metaFromName.title || "Page",
        slug: normalizePathSlug(metaFromName.slug || filenameToSlug(file.originalname)),
        order: metaFromName.order ?? i,
        html_cloudinary_url: htmlCloudinaryUrl,
        html_cloudinary_public_id: htmlPublicId || null,
      });
    }

    // Ensure unique slugs; prefer first as home if none marked "/"
    if (!publishedPages.some((p) => p.slug === "/")) {
      publishedPages[0].slug = "/";
      publishedPages[0].id = publishedPages[0].id || "home";
      publishedPages[0].title = publishedPages[0].title || "Home";
    }

    const homePage = publishedPages.find((p) => p.slug === "/" || p.id === "home") || publishedPages[0];
    const siteUrl = buildSiteUrl(slug);

    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          status:                        "published",
          subdomain_slug:                slug,
          published_pages:               publishedPages,
          html_cloudinary_url:           homePage.html_cloudinary_url,
          html_cloudinary_public_id:     homePage.html_cloudinary_public_id || null,
          scladapp_website_url:          siteUrl,
          scladapp_website_published_at: new Date(),
        },
      },
      { new: true }
    );

    await School.updateOne(
      { school_id: schoolId },
      { $set: { website: siteUrl, website_requested: true, updated_at: new Date() } }
    );

    res.json({
      success: true,
      data: doc,
      message: "Website published.",
      site_url: siteUrl,
      pages: publishedPages.map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
    });
  } catch (err) {
    console.error("[publish error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET  /sites/:slug  and  /sites/:slug/*pagePath  (also used for custom domain / subdomain hosts)
const injectBaseHref = (html, baseHref) => {
  if (!html || typeof html !== "string") return html;
  const safe = String(baseHref || "/").replace(/"/g, "");
  let out = html.replace(/<base\b[^>]*>/gi, "");
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${safe}" />`);
  } else {
    out = `<base href="${safe}" />\n${out}`;
  }
  return out;
};

const normalizeDomain = (input) => {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
};

exports.normalizeDomain = normalizeDomain;

exports.serveSchoolSite = async (req, res) => {
  try {
    const { slug } = req.params;
    const rawPath = req.params.pagePath
      || req.params[0]
      || (slug && req.path.includes(`/sites/${slug}/`) ? req.path.split(`/sites/${slug}/`)[1] : "")
      || (req.siteMount === "host" ? String(req.path || "/").replace(/^\//, "") : "")
      || "";
    const pageSlug = normalizePathSlug(rawPath);

    let doc = req.siteDoc || null;
    if (!doc && slug) {
      doc = await WebsiteRequest.findOne({ subdomain_slug: slug, status: "published" }).lean();
    }
    if (!doc) {
      return res.status(404).send("<h1>Site not found</h1>");
    }

    let htmlUrl = null;
    const published = Array.isArray(doc.published_pages) ? doc.published_pages : [];
    if (published.length) {
      const match = published.find((p) => normalizePathSlug(p.slug) === pageSlug)
        || (pageSlug === "/" ? published.find((p) => p.id === "home") : null);
      htmlUrl = match?.html_cloudinary_url || null;
    }
    if (!htmlUrl && pageSlug === "/") {
      htmlUrl = doc.html_cloudinary_url;
    }

    if (!htmlUrl) {
      return res.status(404).send("<h1>Page not found</h1>");
    }

    const response = await fetch(htmlUrl);
    if (!response.ok) {
      return res.status(502).send("<h1>Could not load site content</h1>");
    }

    let html = await response.text();

    // Host-based (custom domain / platform subdomain) → site root base
    // Path-based (/sites/:slug/...) → base under that mount so relative links work
    const siteSlug = doc.subdomain_slug || slug;
    const baseHref = req.siteMount === "host"
      ? "/"
      : `/sites/${siteSlug}/`;
    html = injectBaseHref(html, baseHref);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Site-Mount", req.siteMount || "path");
    res.send(html);
  } catch (err) {
    console.error("[serveSchoolSite]", err);
    res.status(500).send("<h1>Server error</h1>");
  }
};

// POST /api/schools/:schoolId/website-request/custom-domain
exports.setCustomDomain = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const domain = normalizeDomain(req.body?.domain);
    if (!domain || !domain.includes(".")) {
      return res.status(400).json({ success: false, message: "Enter a valid domain like yourschool.com" });
    }

    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (!existing || existing.status !== "published") {
      return res.status(400).json({ success: false, message: "Publish the website before connecting a custom domain." });
    }

    const clash = await WebsiteRequest.findOne({
      school_id: { $ne: schoolId },
      custom_domain: domain,
      status: "published",
    }).lean();
    if (clash) {
      return res.status(409).json({ success: false, message: "That domain is already linked to another school." });
    }

    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          custom_domain: domain,
          custom_domain_status: "pending",
          custom_domain_updated_at: new Date(),
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      data: doc,
      message: "Domain saved. Add the DNS records, then verify.",
      dns: {
        a_record: process.env.CUSTOM_DOMAIN_A_RECORD || process.env.SERVER_PUBLIC_IP || "your-server-ip",
        cname_www: domain,
        cname_target: process.env.CUSTOM_DOMAIN_CNAME_TARGET || (process.env.PROD_DOMAIN ? `sites.${process.env.PROD_DOMAIN}` : null),
      },
    });
  } catch (err) {
    console.error("[setCustomDomain]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/schools/:schoolId/website-request/custom-domain/verify
exports.verifyCustomDomain = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const existing = await WebsiteRequest.findOne({ school_id: schoolId });
    if (!existing?.custom_domain) {
      return res.status(400).json({ success: false, message: "No custom domain saved." });
    }
    if (existing.status !== "published") {
      return res.status(400).json({ success: false, message: "Website must be published." });
    }

    const domain = existing.custom_domain;
    const expectedA = String(process.env.CUSTOM_DOMAIN_A_RECORD || process.env.SERVER_PUBLIC_IP || "").trim();
    const expectedCname = String(process.env.CUSTOM_DOMAIN_CNAME_TARGET || "").trim().replace(/\.$/, "").toLowerCase();

    if (!expectedA && !expectedCname) {
      return res.status(503).json({
        success: false,
        message: "Domain verification is not configured on the server yet. Set SERVER_PUBLIC_IP (or CUSTOM_DOMAIN_A_RECORD) in the backend .env, then try again. Your domain stays pending until DNS can be checked.",
      });
    }

    const dns = require("dns").promises;
    let dnsOk = false;
    let dnsDetail = "";

    // Prefer A record match
    if (expectedA) {
      try {
        const addrs = await dns.resolve4(domain);
        if (addrs.includes(expectedA)) {
          dnsOk = true;
          dnsDetail = `A record matches ${expectedA}`;
        } else {
          dnsDetail = `A records found: ${addrs.join(", ") || "none"}; expected ${expectedA}`;
        }
      } catch (err) {
        dnsDetail = `No A record found for ${domain} (${err.code || err.message}). Add the DNS A record first, wait for propagation, then verify.`;
      }
    }

    // Optional CNAME fallback (apex rarely has CNAME; useful for www or alias hosts)
    if (!dnsOk && expectedCname) {
      try {
        const cnames = await dns.resolveCname(domain);
        const normalized = cnames.map((c) => String(c).replace(/\.$/, "").toLowerCase());
        if (normalized.some((c) => c === expectedCname || c.endsWith(`.${expectedCname}`))) {
          dnsOk = true;
          dnsDetail = `CNAME matches ${expectedCname}`;
        } else if (!dnsDetail) {
          dnsDetail = `CNAME found: ${normalized.join(", ") || "none"}; expected ${expectedCname}`;
        }
      } catch (err) {
        if (!dnsDetail) {
          dnsDetail = `No CNAME found for ${domain} (${err.code || err.message}).`;
        }
      }
    }

    if (!dnsOk) {
      // Never leave a false "connected" state
      const pendingDoc = await WebsiteRequest.findOneAndUpdate(
        { school_id: schoolId },
        { $set: { custom_domain_status: "pending", custom_domain_updated_at: new Date() } },
        { new: true }
      );
      return res.status(400).json({
        success: false,
        message: "DNS not verified. Add the required DNS records, wait for propagation, then try again.",
        dns_detail: dnsDetail,
        data: pendingDoc,
      });
    }

    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          custom_domain_status: "connected",
          custom_domain_updated_at: new Date(),
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      data: doc,
      message: "Custom domain connected.",
      dns_detail: dnsDetail,
      site_url: `https://${domain}`,
    });
  } catch (err) {
    console.error("[verifyCustomDomain]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/schools/:schoolId/website-request/custom-domain
exports.removeCustomDomain = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const doc = await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $unset: {
          custom_domain: 1,
          custom_domain_status: 1,
        },
        $set: {
          custom_domain_updated_at: new Date(),
        },
      },
      { new: true }
    );
    res.json({ success: true, data: doc, message: "Custom domain removed." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
