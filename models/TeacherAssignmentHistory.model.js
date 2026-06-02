const mongoose = require("mongoose");

const teacherAssignmentHistorySchema = new mongoose.Schema(
  {
    history_id: { type: String, required: true, unique: true },
    teacher_id: { type: String, required: true },
    teacher_code: { type: String, default: null },
    school_id: { type: String, required: true },
    old_staff_id: { type: String, default: null },
    old_staff_name: { type: String, default: null },
    old_staff_email: { type: String, default: null },
    new_staff_id: { type: String, default: null },
    new_staff_name: { type: String, default: null },
    new_staff_email: { type: String, default: null },
    changed_by: { type: String, default: null },
    changed_at: { type: Date, default: Date.now },
    reason: { type: String, default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.model("TeacherAssignmentHistory", teacherAssignmentHistorySchema);
