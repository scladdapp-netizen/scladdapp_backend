const mongoose = require("mongoose");

const schoolCalendarSchema = new mongoose.Schema(
  {
    calendar_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    session_id: { type: String, default: null },
    session_name: { type: String, default: null },
    subsession_id: { type: String, default: null },
    subsession_name: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    calendar_date: { type: String, default: null },
    calendar_time: { type: String, default: null },
    type: { type: String, default: null },
    location: { type: String, default: null },
    duration: { type: String, default: null },
    participants: { type: String, default: null },
    priority: { type: String, default: "Medium" },
    status: { type: String, default: "Scheduled" },
    created_by: { type: String, default: null },
    created_by_name: { type: String, default: null },
    created_by_role: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SchoolCalendar", schoolCalendarSchema);
