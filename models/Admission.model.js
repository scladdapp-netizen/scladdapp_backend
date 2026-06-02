const mongoose = require("mongoose");

const admissionSchema = new mongoose.Schema(
  {
    admission_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    admitted_date: { type: String, default: null },
    close_date: { type: String, default: null },
    admission_class: { type: String, default: null },
    admission_session: { type: String, default: null },
    admission_term: { type: String, default: "Not Assigned" },
    active_status: { type: Boolean, default: true },
    is_graduated: { type: Boolean, default: false },
    graduated_id: { type: String, default: null },
    graduation_session_id: { type: String, default: null },
    graduation_session_name: { type: String, default: null },
    admission_type: { type: String, default: "new" },
    previous_school: { type: String, default: null },
    transfer_certificate: { type: String, default: null },
    remarks: { type: String, default: null },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Admission", admissionSchema);
