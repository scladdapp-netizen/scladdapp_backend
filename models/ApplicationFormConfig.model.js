const mongoose = require("mongoose");

const applicationFormConfigSchema = new mongoose.Schema(
  {
    school_id: { type: String, required: true, unique: true },
    enabled_fields: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
    updated_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ApplicationFormConfig", applicationFormConfigSchema);
