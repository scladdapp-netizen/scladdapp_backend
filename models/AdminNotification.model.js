const mongoose = require("mongoose");

/**
 * AdminNotification — a notification sent to all admins of a school.
 * Read status is tracked per-admin so that one admin reading it
 * does NOT mark it as read for other admins.
 */
const AdminNotificationSchema = new mongoose.Schema(
  {
    school_id:    { type: String, required: true, index: true },
    title:        { type: String, required: true },
    body:         { type: String, required: true },
    type:         { type: String, enum: ["info", "warning", "success", "alert"], default: "info" },
    created_by_id:   { type: String, default: null },
    created_by_name: { type: String, default: null },

    /**
     * Array of { admin_id, read_at } — one entry per admin who has read it.
     * If an admin's id is NOT in this array → unread for them.
     */
    read_by: [
      {
        admin_id: { type: String, required: true },
        read_at:  { type: Date,   default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminNotification", AdminNotificationSchema);
