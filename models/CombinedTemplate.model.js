const mongoose = require("mongoose");

const gradingFieldSchema = new mongoose.Schema(
  {
    field_name: { type: String, required: true },
    weight: { type: Number, default: 0 },
    max_score: { type: mongoose.Schema.Types.Mixed, default: 0 }, // can be number or string
  },
  { _id: false }
);

const gradingSchemeSchema = new mongoose.Schema(
  {
    grade_letter: { type: String, default: null },
    min_range: { type: mongoose.Schema.Types.Mixed, default: 0 },
    max_range: { type: mongoose.Schema.Types.Mixed, default: 100 },
    grade_point: { type: mongoose.Schema.Types.Mixed, default: null },
    pass_fail: { type: String, default: null },
  },
  { _id: false }
);

const stylingSchema = new mongoose.Schema(
  {
    theme_id: { type: String, default: null },
    theme_name: { type: String, default: null },
    primaryColor: { type: String, default: null },
  },
  { _id: false }
);

const combinedTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    grading_fields: { type: [gradingFieldSchema], default: [] },
    grading_scheme: { type: [gradingSchemeSchema], default: [] },
    total_weight: { type: Number, default: 0 },
    level: { type: String, default: null },
    layout: { type: String, default: null },
    grade_display: { type: String, default: null },
    behavioral_traits: { type: [String], default: [] },
    styling: { type: stylingSchema, default: null },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("CombinedTemplate", combinedTemplateSchema);
