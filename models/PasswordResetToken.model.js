const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema({
  token:      { type: String, required: true, unique: true },
  user_id:    { type: String, required: true },   // reference_id (staff_id, student_id, etc.)
  user_type:  { type: String, required: true },   // "staff", "student", etc.
  email:      { type: String, required: true },
  expires_at: { type: Date,   required: true },
  used:       { type: Boolean, default: false },
}, { timestamps: { createdAt: "created_at", updatedAt: false } });

// Auto-delete expired tokens after 24h
passwordResetTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
