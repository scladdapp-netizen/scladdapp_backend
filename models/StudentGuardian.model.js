const mongoose = require("mongoose");

const studentGuardianSchema = new mongoose.Schema(
  {
    guardian_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    guardian_name: { type: String, required: true },
    guardian_relationship: { type: String, default: null },
    guardian_phone: { type: String, default: null },
    guardian_email: { type: String, default: null },
    guardian_address: { type: String, default: null },
    guardian_occupation: { type: String, default: null },
    is_primary: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentGuardian", studentGuardianSchema);
