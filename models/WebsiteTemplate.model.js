const mongoose = require("mongoose");

const websiteTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    label:       { type: String, required: true },
    category:    { type: String, required: true },
    type:        { type: String, enum: ["section", "component"], default: "component" },
    html:        { type: String, required: true },
    sort_order:  { type: Number, default: 0 },
    is_active:   { type: Boolean, default: true },
    created_by:  { type: String, default: null },
    updated_by:  { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("WebsiteTemplate", websiteTemplateSchema);
