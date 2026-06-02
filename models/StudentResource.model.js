const mongoose = require("mongoose");

const studentResourceSchema = new mongoose.Schema(
  {
    resource_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: null },
    file_name: { type: String, default: null },
    file_type: { type: String, default: null },
    file_url: { type: String, default: null },
    file_public_id: { type: String, default: null },
    download_count: { type: Number, default: 0 },
    uploaded_by_id: { type: String, default: null },
    uploaded_by_name: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentResource", studentResourceSchema);
