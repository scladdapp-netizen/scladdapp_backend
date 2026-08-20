const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    user_notification_id: { type: String, required: true, unique: true },
    notification_id: { type: String, required: true },
    school_id: { type: String, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, default: null },
    user_type: { type: String, default: null }, // "student", "staff", "alumni", "guardian"
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
    delivered_at: { type: Date, default: Date.now },
    // Email delivery tracking
    email_address: { type: String, default: null },
    email_sent: { type: Boolean, default: false },
    email_sent_at: { type: Date, default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.model("UserNotification", userNotificationSchema);
