const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    // Identity
    user_type:  { type: String, enum: ["admin", "staff", "teacher", "student"], required: true },
    user_id:    { type: String, required: true },
    user_name:  { type: String, required: true },
    user_email: { type: String },

    // School context
    school_id:   { type: String },
    school_name: { type: String },

    // Ticket content
    type:        { type: String, enum: ["bug", "improvement", "question", "other"], default: "bug" },
    title:       { type: String, required: true },
    description: { type: String, required: true },

    // Attachment on the initial report (optional)
    attachment_url:       { type: String, default: null },
    attachment_public_id: { type: String, default: null },

    // Status lifecycle
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_reply", "resolved", "closed"],
      default: "open",
    },

    // Unread counts for both sides
    user_unread:   { type: Number, default: 0 },
    support_unread:{ type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
