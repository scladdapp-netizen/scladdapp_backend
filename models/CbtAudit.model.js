const mongoose = require("mongoose");

const cbtAuditSchema = new mongoose.Schema(
  {
    audit_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    test_id: { type: String, required: true },
    attempt_id: { type: String, default: null },
    question_id: { type: String, default: null },
    student_id: { type: String, default: null },
    action: { type: String, required: true },
    actor_id: { type: String, default: null },
    actor_role: { type: String, default: null },
    previous: { type: mongoose.Schema.Types.Mixed, default: null },
    next: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

cbtAuditSchema.index({ test_id: 1, at: -1 });

module.exports = mongoose.model("CbtAudit", cbtAuditSchema);
