const mongoose = require("mongoose");

/**
 * SchoolAIToken — tracks the AI token balance for each school.
 * One document per school. Tokens are spent on AI edits (website + timetable).
 */
const schoolAITokenSchema = new mongoose.Schema(
  {
    school_id:    { type: String, required: true, unique: true },
    balance:      { type: Number, default: 0, min: 0 },
    total_bought: { type: Number, default: 0 },
    total_used:   { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("SchoolAIToken", schoolAITokenSchema);
