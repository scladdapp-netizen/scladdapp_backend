const mongoose = require("mongoose");

// ── Section content schema ────────────────────────────────────────────────────
const sectionSchema = new mongoose.Schema(
  {
    id:         { type: String, required: true }, // unique per page, e.g. "about__k3f9a1"
    categoryId: { type: String, default: null },  // template category, e.g. "hero", "about"
    label:      { type: String, required: true }, // display name
    templateId: { type: String, default: null },  // selected WebsiteTemplate template_id
    isCustom:   { type: Boolean, default: false }, // freeform custom section (non-template)
    content:    { type: mongoose.Schema.Types.Mixed, default: {} }, // keyed field values
    notes:      { type: String, default: "" },
    order:      { type: Number, default: 0 },
  },
  { _id: false }
);

const pageSchema = new mongoose.Schema(
  {
    id:       { type: String, required: true }, // e.g. "home", "about"
    title:    { type: String, required: true }, // display name
    slug:     { type: String, required: true }, // e.g. "/", "/about"
    order:    { type: Number, default: 0 },
    sections: { type: [sectionSchema], default: [] },
  },
  { _id: false }
);

const draftPageSchema = new mongoose.Schema(
  {
    id:    { type: String, required: true },
    title: { type: String, default: "Page" },
    slug:  { type: String, required: true },
    order: { type: Number, default: 0 },
    html:  { type: String, default: "" },
  },
  { _id: false }
);

const publishedPageSchema = new mongoose.Schema(
  {
    id:                  { type: String, required: true },
    title:               { type: String, default: "Page" },
    slug:                { type: String, required: true },
    order:               { type: Number, default: 0 },
    html_cloudinary_url:       { type: String, default: null },
    html_cloudinary_public_id: { type: String, default: null },
  },
  { _id: false }
);

const websiteRequestSchema = new mongoose.Schema(
  {
    school_id:          { type: String, required: true, unique: true },

    // ── Structured brief (replaces description_doc) ─────────────────────────
    brief: {
      // Step 1 — Brand & Style
      primary_color:    { type: String, default: "#111111" },
      secondary_color:  { type: String, default: "#6c5ce7" },
      background_color: { type: String, default: "#ffffff" },
      font_style:       { type: String, enum: ["modern", "classic", "playful"], default: "modern" },
      theme:            { type: String, enum: ["light", "dark"], default: "light" },

      // Step 2 — Pages (each page has its own sections)
      pages: { type: [pageSchema], default: [] },

      // Legacy flat sections (migrated into pages[0] when loading older briefs)
      sections: { type: [sectionSchema], default: [] },

      // Step 3 — Final notes
      final_notes: { type: String, default: "" },
    },

    // ── Legacy document fields (kept for backward compatibility) ──────────
    description_doc_url:  { type: String, default: null },
    description_doc_name: { type: String, default: null },
    reference_image_url:  { type: String, default: null },
    reference_image_name: { type: String, default: null },

    // ── Scladapp-built website (set by admin after publishing) ─────────────
    scladapp_website_url:          { type: String, default: null },
    scladapp_website_published_at: { type: Date,   default: null },
    subdomain_slug:                { type: String, default: null },
    html_cloudinary_url:           { type: String, default: null }, // home page mirror (legacy)
    html_cloudinary_public_id:     { type: String, default: null },
    published_pages:               { type: [publishedPageSchema], default: [] },

    // ── Custom domain (school's own domain pointing at this hosted site) ───
    custom_domain:                 { type: String, default: null }, // normalized, no www/protocol
    custom_domain_status:          { type: String, enum: ["pending", "connected"], default: null },
    custom_domain_updated_at:      { type: Date, default: null },

    // ── Status ──────────────────────────────────────────────────────────────
    status:       { type: String, enum: ["draft", "submitted", "published"], default: "draft" },
    submitted_at: { type: Date, default: null },

    // ── AI Editor draft HTML ─────────────────────────────────────────────────
    draft_html:   { type: String, default: null }, // home page mirror (legacy)
    draft_pages:  { type: [draftPageSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("WebsiteRequest", websiteRequestSchema);
