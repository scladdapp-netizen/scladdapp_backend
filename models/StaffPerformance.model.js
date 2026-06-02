const mongoose = require("mongoose");

const categoryEntrySchema = new mongoose.Schema(
  {
    score: { type: Number, default: 0 },
    rating: { type: String, default: null },
    comments: { type: String, default: "" },
  },
  { _id: false }
);

const staffPerformanceSchema = new mongoose.Schema(
  {
    evaluation_id: { type: String, required: true, unique: true },
    staff_id: { type: String, required: true },
    school_id: { type: String, required: true },
    evaluation_type: { type: String, default: null },
    evaluation_period: { type: String, default: null },
    evaluator: { type: String, default: null },
    evaluator_role: { type: String, default: null },
    evaluation_date: { type: String, default: null },
    status: { type: String, default: null },
    overall_rating: { type: String, default: null },
    overall_score: { type: Number, default: 0 },
    max_score: { type: Number, default: 5 },
    // dynamic keys per evaluation — use Mixed
    categories: { type: mongoose.Schema.Types.Mixed, default: {} },
    strengths: { type: [String], default: [] },
    areas_for_improvement: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    comments: { type: String, default: "" },
    entered_by_id: { type: String, default: null },
    entered_by_name: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("StaffPerformance", staffPerformanceSchema);
