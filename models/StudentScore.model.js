const mongoose = require("mongoose");

const studentScoreSchema = new mongoose.Schema(
  {
    score_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    student_name: { type: String, default: "" },
    school_id: { type: String, required: true },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    class_id: { type: String, default: null },
    subject_id: { type: String, required: true },
    subject_name: { type: String, default: null },
    teacher_id: { type: String, default: null },
    teacher_name: { type: String, default: null },
    grading_template_id: { type: mongoose.Schema.Types.Mixed, default: null }, // string or number
    // dynamic score fields (ft, st, ex, etc.) — use Mixed
    scores: { type: mongoose.Schema.Types.Mixed, default: {} },
    entered_by: { type: String, default: null },
    entered_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model("StudentScore", studentScoreSchema);
