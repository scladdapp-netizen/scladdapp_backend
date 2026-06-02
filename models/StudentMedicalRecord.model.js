const mongoose = require("mongoose");

const studentMedicalRecordSchema = new mongoose.Schema(
  {
    record_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    record_date: { type: String, default: null },
    record_type: { type: String, default: null }, // "injury", "illness", "chronic_condition", "general"
    diagnosis: { type: String, default: null },
    symptoms: { type: String, default: null },
    treatment: { type: String, default: null },
    prescription: { type: String, default: null },
    doctor_name: { type: String, default: null },
    hospital_clinic: { type: String, default: null },
    doctor_phone: { type: String, default: null },
    allergies: { type: String, default: null },
    chronic_conditions: { type: String, default: null },
    medications: { type: String, default: null },
    notes: { type: String, default: null },
    follow_up_required: { type: Boolean, default: false },
    follow_up_date: { type: String, default: null },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentMedicalRecord", studentMedicalRecordSchema);
