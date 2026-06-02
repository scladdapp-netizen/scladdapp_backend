const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    student_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    admission_number: { type: String, default: null },
    full_name: { type: String, required: true },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    date_of_birth: { type: String, default: null },
    gender: { type: String, default: null },
    religion: { type: String, default: null },
    nationality: { type: String, default: null },
    state_of_origin: { type: String, default: null },
    address: { type: String, default: null },
    blood_group: { type: String, default: null },
    genotype: { type: String, default: null },
    student_photo: { type: String, default: null },
    current_class: { type: String, default: null },
    admission_date: { type: String, default: null },
    student_status: { type: String, default: "active" },
    emergency_contact_name: { type: String, default: null },
    emergency_contact_phone: { type: String, default: null },
    emergency_contact_relationship: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Student", studentSchema);
