const mongoose = require("mongoose");

const studentApplicationSchema = new mongoose.Schema(
  {
    application_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    is_seen: { type: Boolean, default: false },
    seen_at: { type: Date, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    files: { type: mongoose.Schema.Types.Mixed, default: {} },
    submitted_at: { type: Date, default: Date.now },
    reviewed_at: { type: Date, default: null },
    reviewed_by: { type: String, default: null },
    review_notes: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentApplication", studentApplicationSchema);
