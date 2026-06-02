const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true },
    user_type: { type: String, required: true }, // "admin", "staff", "teacher", "student"
    reference_id: { type: String, required: true }, // points to admin_id, staff_id, or student_id
    email: { type: String, required: true },
    password: { type: String, default: null }, // null for admin (password stored in admins collection)
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("User", userSchema);
