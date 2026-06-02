const mongoose = require("mongoose");

const scoreFieldSchema = new mongoose.Schema(
  {
    score: { type: mongoose.Schema.Types.Mixed, default: null }, // can be number or null
    weight: { type: Number, default: 0 },
    max_score: { type: Number, default: 0 },
  },
  { _id: false }
);

const reportSubjectSchema = new mongoose.Schema(
  {
    subject_id: { type: String, default: null },
    subject_name: { type: String, default: null },
    teacher_id: { type: String, default: null },
    teacher_name: { type: String, default: null },
    // dynamic score keys (ft, st, ex, etc.) — use Mixed
    scores: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const behavioralTraitSchema = new mongoose.Schema(
  {
    trait: { type: String, default: null },
    rating: { type: String, default: null },
  },
  { _id: false }
);

const studentReportSchema = new mongoose.Schema(
  {
    report_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    student_name: { type: String, default: "" },
    school_id: { type: String, required: true },
    class_id: { type: String, default: null },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    term_name: { type: String, default: null },
    template_id: { type: String, default: null },
    generated_at: { type: Date, default: Date.now },
    subjects: { type: [reportSubjectSchema], default: [] },
    behavioral_traits: { type: [behavioralTraitSchema], default: [] },
    teacher_comment: { type: String, default: null },
    principal_comment: { type: String, default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.model("StudentReport", studentReportSchema);
