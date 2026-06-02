const mongoose = require("mongoose");

const alumniCertificateSchema = new mongoose.Schema(
  {
    certificate_id: { type: String, required: true, unique: true },
    alumni_id: { type: String, required: true },
    school_id: { type: String, default: null },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    type: { type: String, default: null }, // e.g. "jpg", "pdf"
    size: { type: String, default: null },
    file_url: { type: String, default: null },
    public_id: { type: String, default: null },
    status: { type: String, enum: ["Pending", "Verified", "Rejected"], default: "Pending" },
    uploaded_by_id: { type: String, default: null },
    uploaded_by_name: { type: String, default: null },
    upload_date: { type: String, default: null },
    updated_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("AlumniCertificate", alumniCertificateSchema);
