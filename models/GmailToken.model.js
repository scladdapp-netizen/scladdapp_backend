const mongoose = require("mongoose");

/**
 * Stores Gmail OAuth 2.0 tokens per school.
 * One document per school_id — upserted on each successful OAuth callback.
 */
const gmailTokenSchema = new mongoose.Schema(
  {
    school_id:     { type: String, required: true, unique: true },
    gmail_address: { type: String, required: true },   // the Gmail address that authorised
    refresh_token: { type: String, required: true },   // long-lived refresh token
    access_token:  { type: String, default: null },    // cached — refreshed automatically
    token_expiry:  { type: Date,   default: null },    // expiry of the cached access token
  },
  { timestamps: { createdAt: "connected_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("GmailToken", gmailTokenSchema);
