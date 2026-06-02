const mongoose = require("mongoose");

const schoolResourceSchema = new mongoose.Schema(
  {
    resource_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: null },
    visibility: { type: String, default: "public" },
    file_name: { type: String, default: null },
    file_type: { type: String, default: null },
    file_url: { type: String, default: null },
    file_public_id: { type: String, default: null },
    file_size: { type: Number, default: 0 },
    download_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SchoolResource", schoolResourceSchema);
