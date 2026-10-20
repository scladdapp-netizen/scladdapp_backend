const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  { id: { type: String, required: true }, text: { type: String, default: "" } },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question_id: { type: String, required: true },
    type: { type: String, enum: ["mcq", "truefalse", "short"], default: "mcq" },
    prompt: { type: String, default: "" },
    options: { type: [optionSchema], default: [] },
    correct_option_id: { type: String, default: "" },
    marks: { type: Number, default: 1 },
    explanation: { type: String, default: "" },
    // Short answer only. All three are private to teachers/admins.
    expected_answer: { type: String, default: "" },
    marking_guide: { type: String, default: "" },
    grading_notes: { type: String, default: "" },
  },
  { _id: false }
);

const cbtTestSchema = new mongoose.Schema(
  {
    test_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true, index: true },
    session_id: { type: String, default: null },
    subsession_id: { type: String, required: true },
    class_id: { type: String, default: null },
    class_name: { type: String, default: "" },
    subject_id: { type: String, required: true },
    subject_name: { type: String, default: "" },

    title: { type: String, default: "" },
    instructions: { type: String, default: "" },
    duration_minutes: { type: Number, default: null },
    grading_field: { type: String, default: "" },
    assessment_max: { type: Number, default: null },
    release_explanations: { type: Boolean, default: false },

    questions: { type: [questionSchema], default: [] },
    total_marks: { type: Number, default: 0 },

    status: { type: String, enum: ["draft", "published", "closed", "archived"], default: "draft" },
    opens_at: { type: Date, default: null },
    closes_at: { type: Date, default: null },
    published_at: { type: Date, default: null },
    published_by: { type: String, default: null },
    closed_at: { type: Date, default: null },
    archived_at: { type: Date, default: null },

    access_code_hash: { type: String, default: null },
    access_code_version: { type: Number, default: 1 },

    // Content becomes read-only once any student has started.
    frozen: { type: Boolean, default: false },

    release_state: { type: String, enum: ["none", "releasing", "released", "partial"], default: "none" },
    released_at: { type: Date, default: null },
    released_by: { type: String, default: null },
    release_lock_at: { type: Date, default: null },

    version: { type: Number, default: 1 },
    created_by: { type: String, default: null },
    created_by_role: { type: String, default: null },
    updated_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

cbtTestSchema.index({ school_id: 1, subject_id: 1, subsession_id: 1, status: 1 });
cbtTestSchema.index({ school_id: 1, access_code_hash: 1 });

module.exports = mongoose.model("CbtTest", cbtTestSchema);
