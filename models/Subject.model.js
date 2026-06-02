const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    subject_id: { type: String, required: true, unique: true },
    subject_name: { type: String, required: true },
    subject_code: { type: String, default: null },
    subject_description: { type: String, default: null },
    stream: { type: String, default: null },
    school_id: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Subject", subjectSchema);
