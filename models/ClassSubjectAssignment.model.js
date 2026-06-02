const mongoose = require("mongoose");

const classSubjectAssignmentSchema = new mongoose.Schema(
  {
    assignment_id: { type: String, required: true, unique: true },
    subject_id: { type: String, required: true },
    class_id: { type: String, required: true },
    class_name: { type: String, default: null },
    class_code: { type: String, default: null },
    school_id: { type: String, required: true },
    start_date: { type: String, default: null },
    end_date: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    assigned_by: { type: String, default: null },
    notes: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ClassSubjectAssignment", classSubjectAssignmentSchema);
