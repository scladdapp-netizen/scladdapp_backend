const mongoose = require("mongoose");

const briefTemplateImageSchema = new mongoose.Schema(
  {
    image_id: { type: String, required: true, unique: true },
    label: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["home", "other"], default: "home" },
    image: { type: String, required: true },
    created_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("BriefTemplateImage", briefTemplateImageSchema);
