const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    notification_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    title: { type: String, default: null },
    resolved_content: { type: String, default: null },
    template_id: { type: String, default: null },
    placeholder_values: { type: mongoose.Schema.Types.Mixed, default: {} },
    delivery_channels: { type: [String], default: [] },
    target_type: { type: String, default: null },
    created_by_id: { type: String, default: null },
    created_by_name: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Notification", notificationSchema);
