const mongoose = require("mongoose");

const reportCardThemeSchema = new mongoose.Schema(
  {
    theme_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    school_id: { type: String, default: null },
    is_global: { type: Boolean, default: false },
    css: { type: String, default: null },
    html_template: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ReportCardTheme", reportCardThemeSchema);
