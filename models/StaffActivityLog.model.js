const mongoose = require("mongoose");

const staffActivityLogSchema = new mongoose.Schema(
  {
    log_id: { type: String, required: true, unique: true },
    staff_type: { type: String, default: null }, // "admin" or "staff"
    user_id: { type: String, required: true },
    school_id: { type: String, default: null },
    action: { type: String, required: true },
    category: { type: String, default: null },
    description: { type: String, default: null },
    status: { type: String, default: "success" },
    performed_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model("StaffActivityLog", staffActivityLogSchema);
