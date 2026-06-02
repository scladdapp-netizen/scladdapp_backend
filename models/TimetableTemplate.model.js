const mongoose = require("mongoose");

const timetableTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    type: { type: String, default: null }, // "custom", "weekly"
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
    // stored as JSON strings in original data
    daily_periods: { type: String, default: null },
    selected_days: { type: String, default: null },
    max_period_duration: { type: Number, default: 40 },
    daily_schedule: { type: String, default: null },
    breaks: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("TimetableTemplate", timetableTemplateSchema);
