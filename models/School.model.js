const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
  {
    school_id: { type: String, required: true, unique: true },
    school_name: { type: String, required: true },
    motto: { type: String, default: null },
    country: { type: String, default: null },
    state: { type: String, default: null },
    address: { type: String, default: null },
    phone_number: { type: String, default: null },
    email: { type: String, default: null },
    logo_url: { type: mongoose.Schema.Types.Mixed, default: null }, // can be string or object
    bio: { type: String, default: null },
    website: { type: String, default: null },           // school's own website URL
    website_requested: { type: Boolean, default: false }, // requested a Scladapp-hosted site
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("School", schoolSchema);
