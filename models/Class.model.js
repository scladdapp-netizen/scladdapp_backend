const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    class_id: { type: String, required: true, unique: true },
    class_name: { type: String, required: true },
    class_code: { type: String, default: null },
    class_section: { type: String, default: null },
    school_id: { type: String, required: true },
    class_type: { type: String, default: "Regular" },
    room_number: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Class", classSchema);
