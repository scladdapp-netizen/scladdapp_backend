const mongoose = require("mongoose");

const TicketMessageSchema = new mongoose.Schema(
  {
    ticket_id:  { type: String, required: true },   // SupportTicket._id as string

    sender_type: { type: String, enum: ["user", "support"], required: true },
    sender_name: { type: String, required: true },

    body: { type: String, default: "" },

    // Optional image attachment on a message
    attachment_url:       { type: String, default: null },
    attachment_public_id: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TicketMessage", TicketMessageSchema);
