const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema({
  token:      { type: String, required: true, unique: true },
  user_id:    { type: String, required: true },
  user_type:  { type: String, required: true },
  email:      { type: String, required: true },
  expires_at: { type: Date,   required: true },
  used:       { type: Boolean, default: false },
  // "invite" = first-time password set, "reset" = forgot password flow
  purpose:    { type: String, default: "invite" },
}, { timestamps: { createdAt: "created_at", updatedAt: false } });

// Auto-delete expired tokens after 24h
passwordResetTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
