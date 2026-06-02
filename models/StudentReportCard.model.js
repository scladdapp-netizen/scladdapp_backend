const mongoose = require("mongoose");

const reportCardSubjectSchema = new mongoose.Schema(
  {
    subject_id: { type: String, default: null },
    subject_name: { type: String, default: null },
    subject_code: { type: String, default: null },
  },
  { _id: false }
);

const studentReportCardSchema = new mongoose.Schema(
  {
    report_card_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    session_id: { type: String, default: null },
    subsession_id: { type: String, default: null },
    class_id: { type: String, default: null },
    subjects: { type: [reportCardSubjectSchema], default: [] },
    published_subjects: { type: [reportCardSubjectSchema], default: [] },
    teacher_remark: { type: String, default: null },
    principal_remark: { type: String, default: null },
    is_published: { type: Boolean, default: false },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StudentReportCard", studentReportCardSchema);
