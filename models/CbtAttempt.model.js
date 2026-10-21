const mongoose = require("mongoose");

const cbtAttemptSchema = new mongoose.Schema(
  {
    attempt_id: { type: String, required: true, unique: true },
    test_id: { type: String, required: true },
    school_id: { type: String, required: true },
    student_id: { type: String, required: true },
    student_name: { type: String, default: "" },
    attempt_number: { type: Number, default: 1 },

    status: { type: String, enum: ["in_progress", "submitted"], default: "in_progress" },
    started_at: { type: Date, default: Date.now },
    // min(started_at + duration, closing time) fixed when the attempt begins.
    allowed_end_at: { type: Date, required: true },
    submitted_at: { type: Date, default: null },
    submit_reason: { type: String, enum: ["student", "timeout", "closed", "teacher", null], default: null },
    // The teacher who started this sitting, and how many extra minutes they added.
    started_by: { type: String, default: null },
    start_kind: { type: String, enum: ["start", "rewrite", null], default: null },
    added_minutes: { type: Number, default: 0 },
    // Public exam link /exam/{link_student}/{link_session}. The student does not sign in.
    link_student: { type: String, default: null },
    link_session: { type: String, default: null },

    auto_graded_at: { type: Date, default: null },
    grading_status: { type: String, enum: ["pending_auto", "pending_manual", "graded"], default: "pending_auto" },
    objective_marks: { type: Number, default: 0 },
    manual_marks: { type: Number, default: 0 },
    marks_earned: { type: Number, default: 0 },
    marks_possible: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    normalized_score: { type: Number, default: null },
    normalized_max: { type: Number, default: null },
    graded_by: { type: String, default: null },
    graded_at: { type: Date, default: null },

    release_status: { type: String, enum: ["unreleased", "released"], default: "unreleased" },
    released_at: { type: Date, default: null },
    released_by: { type: String, default: null },
    score_sync_status: { type: String, enum: ["none", "synced", "failed"], default: "none" },
    score_sync_error: { type: String, default: null },
    synced_value: { type: Number, default: null },
    previous_sheet_value: { type: Number, default: null },
    result_version: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One row per sitting. A rewrite is a new attempt_number; the earlier attempts are kept.
cbtAttemptSchema.index({ test_id: 1, student_id: 1, attempt_number: 1 }, { unique: true });
cbtAttemptSchema.index({ school_id: 1, student_id: 1, release_status: 1 });
cbtAttemptSchema.index({ status: 1, allowed_end_at: 1 });
cbtAttemptSchema.index(
  { link_session: 1, link_student: 1 },
  { unique: true, partialFilterExpression: { link_session: { $type: "string" }, link_student: { $type: "string" } } }
);

module.exports = mongoose.model("CbtAttempt", cbtAttemptSchema);
