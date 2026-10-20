const mongoose = require("mongoose");

const cbtAssignmentSchema = new mongoose.Schema(
  {
    assignment_id: { type: String, required: true, unique: true },
    test_id: { type: String, required: true },
    school_id: { type: String, required: true },
    student_id: { type: String, required: true },
    status: { type: String, enum: ["assigned", "revoked"], default: "assigned" },
    assigned_by: { type: String, default: null },
    assigned_at: { type: Date, default: Date.now },
    revoked_at: { type: Date, default: null },
    // Marked absent by the teacher (cleared when they are started).
    absent: { type: Boolean, default: false },
    // The attempt whose score counts. Empty means "the latest submitted attempt".
    counted_attempt_id: { type: String, default: null },
  },
  { timestamps: false }
);

// One assignment per student per test.
cbtAssignmentSchema.index({ test_id: 1, student_id: 1 }, { unique: true });
cbtAssignmentSchema.index({ school_id: 1, student_id: 1 });

module.exports = mongoose.model("CbtAssignment", cbtAssignmentSchema);
