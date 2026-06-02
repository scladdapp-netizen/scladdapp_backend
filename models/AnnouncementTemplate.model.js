const mongoose = require("mongoose");

const announcementTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "general" },
    subject: { type: String, default: null },
    content: { type: String, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
    // stored as JSON strings in the original data
    channels: { type: String, default: "[]" },
    placeholders: { type: String, default: "[]" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("AnnouncementTemplate", announcementTemplateSchema);
