const mongoose = require("mongoose");

const alumniSchema = new mongoose.Schema(
  {
    alumni_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    school_id: { type: String, required: true },
    graduation_session_id: { type: String, default: null },
    graduation_session_name: { type: String, default: null },
    graduation_date: { type: String, default: null },
    final_class: { type: String, default: null },
    final_class_name: { type: String, default: null },
    current_occupation: { type: String, default: null },
    current_employer: { type: String, default: null },
    current_position: { type: String, default: null },
    current_location: { type: String, default: null },
    contact_email: { type: String, default: null },
    contact_phone: { type: String, default: null },
    contact_address: { type: String, default: null },
    linkedin_profile: { type: String, default: null },
    facebook_profile: { type: String, default: null },
    twitter_handle: { type: String, default: null },
    achievements: { type: String, default: null },
    awards: { type: String, default: null },
    remarks: { type: String, default: null },
    willing_to_mentor: { type: Boolean, default: false },
    willing_to_speak: { type: Boolean, default: false },
    willing_to_donate: { type: Boolean, default: false },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Alumni", alumniSchema);
