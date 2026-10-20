const mongoose = require("mongoose");

const cbtResponseSchema = new mongoose.Schema(
  {
    attempt_id: { type: String, required: true },
    test_id: { type: String, required: true },
    school_id: { type: String, required: true },
    student_id: { type: String, required: true },
    question_id: { type: String, required: true },

    answer: { type: String, default: "" },
    flagged: { type: Boolean, default: false },
    answered_at: { type: Date, default: null },

    // null until graded. awarded_marks is what counts toward the total.
    awarded_marks: { type: Number, default: null },
    grading_source: { type: String, enum: ["auto", "manual", null], default: null },
    feedback: { type: String, default: "" },
    graded_by: { type: String, default: null },
    graded_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One response per question per attempt.
cbtResponseSchema.index({ attempt_id: 1, question_id: 1 }, { unique: true });
cbtResponseSchema.index({ test_id: 1 });

module.exports = mongoose.model("CbtResponse", cbtResponseSchema);
