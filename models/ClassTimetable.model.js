const mongoose = require("mongoose");

const timetableSubjectSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
    code: { type: String, default: null },
    teacher: { type: String, default: null },
    stream: { type: String, default: null },
    streamName: { type: String, default: null },
    displayName: { type: String, default: null },
  },
  { _id: false }
);

const timetableEntrySchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.Mixed, default: null }, // can be number or string
    day: { type: String, default: null },
    start: { type: String, default: null },
    end: { type: String, default: null },
    name: { type: String, default: null },
    teacher: { type: String, default: "" },
    stream: { type: String, default: "" },
    streamName: { type: String, default: "" },
    streamColor: { type: String, default: "" },
    subjects: { type: [timetableSubjectSchema], default: [] },
    isBreak: { type: Boolean, default: false },
  },
  { _id: false }
);

const classTimetableSchema = new mongoose.Schema(
  {
    timetable_id: { type: String, required: true, unique: true },
    class_id: { type: String, required: true },
    subsession_id: { type: String, default: null },
    school_id: { type: String, required: true },
    entries: { type: [timetableEntrySchema], default: [] },
    generated_by: { type: String, default: null },
    generated_at: { type: Date, default: null },
    updated_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("ClassTimetable", classTimetableSchema);
