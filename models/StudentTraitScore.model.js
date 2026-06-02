const mongoose = require("mongoose");

const studentTraitScoreSchema = new mongoose.Schema(
  {
    score_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    student_name: { type: String, default: "" },
    school_id: { type: String, default: null },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    class_id: { type: String, default: null },
    // dynamic trait keys (e.g. "Self-Control": "Excellent") — use Mixed
    traits: { type: mongoose.Schema.Types.Mixed, default: {} },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentTraitScore", studentTraitScoreSchema);
