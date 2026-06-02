const mongoose = require("mongoose");

const subsessionSchema = new mongoose.Schema(
  {
    term_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    session_id: { type: String, required: true },
    term_name: { type: String, required: true },
    term_code: { type: String, default: null },
    term_start_date: { type: String, default: null },
    term_end_date: { type: String, default: null },
    term_status: { type: String, default: "draft" },
    is_archived: { type: Boolean, default: false },
    grading_template_id: { type: mongoose.Schema.Types.Mixed, default: null }, // string or number
    grading_template_name: { type: String, default: null },
    fee_bill_template_id: { type: String, default: null },
    fee_bill_template_name: { type: String, default: null },
    created_by: { type: String, default: null },
    created_by_name: { type: String, default: null },
    created_by_role: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Subsession", subsessionSchema);
