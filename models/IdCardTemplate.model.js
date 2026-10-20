const mongoose = require("mongoose");

const idCardTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    card_type: { type: String, enum: ["student", "staff"], default: "student" },
    size_id: { type: String, default: "cr80-landscape" },
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("IdCardTemplate", idCardTemplateSchema);
