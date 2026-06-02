const mongoose = require("mongoose");

const studentClassAssignmentSchema = new mongoose.Schema(
  {
    assignment_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    class_id: { type: String, required: true },
    class_name: { type: String, default: null },
    stream: { type: String, default: null },
    session_id: { type: String, default: null },
    session_name: { type: String, default: null },
    subsession_id: { type: String, default: null },
    subsession_name: { type: String, default: null },
    assignment_method: { type: String, default: null }, // "admission", "promotion", "demotion"
    assignment_date: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    assigned_by: { type: String, default: null },
    remarks: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentClassAssignment", studentClassAssignmentSchema);
