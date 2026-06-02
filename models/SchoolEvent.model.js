const mongoose = require("mongoose");

const schoolEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    session_id: { type: String, default: null },
    session_name: { type: String, default: null },
    subsession_id: { type: String, default: null },
    subsession_name: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    event_date: { type: String, default: null },
    event_time: { type: String, default: null },
    location: { type: String, default: null },
    category: { type: String, default: null },
    organizer: { type: String, default: null },
    participants: { type: String, default: null },
    status: { type: String, default: "Upcoming" },
    created_by: { type: String, default: null },
    created_by_name: { type: String, default: null },
    created_by_role: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SchoolEvent", schoolEventSchema);
