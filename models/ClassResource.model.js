const mongoose = require("mongoose");

const classResourceSchema = new mongoose.Schema(
  {
    resource_id: { type: String, required: true, unique: true },
    class_id: { type: String, required: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: null },
    file_name: { type: String, default: null },
    file_type: { type: String, default: null },
    file_url: { type: String, default: null },
    file_public_id: { type: String, default: null },
    file_size: { type: Number, default: 0 },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    download_count: { type: Number, default: 0 },
    uploaded_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ClassResource", classResourceSchema);
