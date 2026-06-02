const mongoose = require("mongoose");

const schoolGallerySchema = new mongoose.Schema(
  {
    gallery_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    caption: { type: String, default: "" },
    category: { type: String, default: "General" },
    file_url: { type: String, default: null },
    file_public_id: { type: String, default: null },
    file_name: { type: String, default: null },
    file_size: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SchoolGallery", schoolGallerySchema);
