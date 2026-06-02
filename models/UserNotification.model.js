const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    user_notification_id: { type: String, required: true, unique: true },
    notification_id: { type: String, required: true },
    school_id: { type: String, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, default: null },
    user_type: { type: String, default: null }, // "student", "staff", "alumni"
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
    delivered_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model("UserNotification", userNotificationSchema);
