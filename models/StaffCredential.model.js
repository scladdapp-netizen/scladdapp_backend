const mongoose = require("mongoose");

const staffCredentialSchema = new mongoose.Schema(
  {
    credential_id: { type: String, required: true, unique: true },
    staff_id: { type: String, required: true },
    school_id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: null },
    fileName: { type: String, default: null },
    type: { type: String, default: null },
    size: { type: String, default: null },
    file_url: { type: String, default: null },
    file_public_id: { type: String, default: null },
    file_size: { type: Number, default: 0 },
    issuer: { type: String, default: null },
    documentNumber: { type: String, default: null },
    uploadDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    status: { type: String, enum: ["Active", "Inactive", "Expired"], default: "Active" },
    isRequired: { type: Boolean, default: false },
    verificationStatus: { type: String, default: "Pending" },
    downloadCount: { type: Number, default: 0 },
    uploaded_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StaffCredential", staffCredentialSchema);
