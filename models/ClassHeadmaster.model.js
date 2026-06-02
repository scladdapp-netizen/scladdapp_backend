const mongoose = require("mongoose");

const classHeadmasterSchema = new mongoose.Schema(
  {
    assignment_id: { type: String, required: true, unique: true },
    class_id: { type: String, required: true },
    teacher_id: { type: String, required: true },
    teacher_name: { type: String, default: null },
    teacher_email: { type: String, default: null },
    school_id: { type: String, required: true },
    session_id: { type: String, default: null },
    session_name: { type: String, default: null },
    session_code: { type: String, default: null },
    start_date: { type: String, default: null },
    end_date: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    assigned_by: { type: String, default: null },
    notes: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ClassHeadmaster", classHeadmasterSchema);
