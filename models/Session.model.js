const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    session_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    session_name: { type: String, required: true },
    session_code: { type: String, default: null },
    academic_year_start_date: { type: String, default: null },
    academic_year_end_date: { type: String, default: null },
    session_status: { type: String, default: "draft" },
    is_archived: { type: Boolean, default: false },
    created_by: { type: String, default: null },
    created_by_name: { type: String, default: null },
    created_by_role: { type: String, default: null },
    modified_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Session", sessionSchema);
