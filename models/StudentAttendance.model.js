const mongoose = require("mongoose");

const studentAttendanceSchema = new mongoose.Schema(
  {
    attendance_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    class_id: { type: String, default: null },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    attendance_date: { type: String, required: true },
    status: { type: String, enum: ["present", "absent", "excused", "late"], default: "present" },
    marked_by: { type: String, default: null },
    marked_at: { type: Date, default: Date.now },
    notes: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentAttendance", studentAttendanceSchema);
