const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    teacher_id: { type: String, required: true, unique: true },
    staff_id: { type: String, required: true },
    school_id: { type: String, required: true },
    teacher_code: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    appointed_by: { type: String, default: null },
    appointed_at: { type: Date, default: Date.now },
    revoked_at: { type: Date, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Teacher", teacherSchema);
