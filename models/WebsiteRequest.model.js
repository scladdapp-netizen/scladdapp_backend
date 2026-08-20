const mongoose = require("mongoose");

// ── Section content schema ────────────────────────────────────────────────────
const sectionSchema = new mongoose.Schema(
  {
    id:         { type: String, required: true }, // category id, e.g. "hero", "about"
    label:      { type: String, required: true }, // display name
    templateId: { type: String, default: null },  // selected WebsiteTemplate template_id
    content:    { type: mongoose.Schema.Types.Mixed, default: {} }, // keyed field values
    notes:      { type: String, default: "" },
    order:      { type: Number, default: 0 },
  },
  { _id: false }
);

const websiteRequestSchema = new mongoose.Schema(
  {
    school_id:          { type: String, required: true, unique: true },

    // ── Structured brief (replaces description_doc) ─────────────────────────
    brief: {
      // Step 1 — Brand & Style
      primary_color:   { type: String, default: "#111111" },
      secondary_color: { type: String, default: "#6c5ce7" },
      font_style:      { type: String, enum: ["modern", "classic", "playful"], default: "modern" },
      theme:           { type: String, enum: ["light", "dark"], default: "light" },

      // Step 2 — Sections
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
    html_cloudinary_url:           { type: String, default: null },

    // ── Status ──────────────────────────────────────────────────────────────
    status:       { type: String, enum: ["draft", "submitted", "published"], default: "draft" },
    submitted_at: { type: Date, default: null },

    // ── AI Editor draft HTML ─────────────────────────────────────────────────
    draft_html:   { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("WebsiteRequest", websiteRequestSchema);
