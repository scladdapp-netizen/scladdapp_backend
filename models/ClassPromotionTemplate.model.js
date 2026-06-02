const mongoose = require("mongoose");

const classPromotionTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    level: { type: String, default: "All Levels" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
    // stored as JSON strings in the original data
    criteria: { type: String, default: "[]" },
    class_promotions: { type: String, default: "[]" },
    retention_policy: { type: String, default: "" },
    appeal_process: { type: String, default: "" },
    notifications: { type: String, default: "{}" },
    total_weight: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ClassPromotionTemplate", classPromotionTemplateSchema);
