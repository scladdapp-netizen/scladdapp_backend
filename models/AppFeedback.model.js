const mongoose = require("mongoose");

const AppFeedbackSchema = new mongoose.Schema(
  {
    // Who submitted
    user_type: { type: String, enum: ["admin", "staff", "teacher", "student"], required: true },
    user_id:   { type: String, required: true },
    user_name: { type: String, required: true },
    user_email:{ type: String },

    // School context
    school_id:   { type: String },
    school_name: { type: String },

    // Feedback
    type:    { type: String, enum: ["report", "improvement"], required: true },
    message: { type: String, required: true },

    // Meta
    status: { type: String, enum: ["new", "reviewed", "resolved"], default: "new" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppFeedback", AppFeedbackSchema);
