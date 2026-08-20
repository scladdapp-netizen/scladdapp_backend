const express  = require("express");
const multer   = require("multer");
const router   = express.Router();

const SupportTicket  = require("../models/SupportTicket.model");
const TicketMessage  = require("../models/TicketMessage.model");
const { uploadToCloudinary } = require("../utils/cloudinary");

const upload = multer({ storage: multer.memoryStorage() });

/* ─────────────────────────────────────────────────────────────
   POST /api/support-tickets
   Create a new ticket (with optional image attachment)
───────────────────────────────────────────────────────────── */
router.post("/", upload.single("attachment"), async (req, res) => {
  try {
    const {
      user_type, user_id, user_name, user_email,
      school_id, school_name,
      type, title, description,
    } = req.body;

    if (!user_type || !user_id || !user_name || !title || !description) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    let attachment_url       = null;
    let attachment_public_id = null;

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "scladapp/support_tickets",
        "image"
      );
      attachment_url       = result.url;
      attachment_public_id = result.public_id;
    }

    const ticket = await SupportTicket.create({
      user_type, user_id, user_name, user_email,
      school_id, school_name,
      type: type || "bug",
      title,
      description,
      attachment_url,
      attachment_public_id,
    });

    return res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    console.error("Create ticket error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/support-tickets?user_id=&user_type=
   Get all tickets for a user
───────────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const { user_id, user_type } = req.query;
    if (!user_id || !user_type) {
      return res.status(400).json({ success: false, message: "user_id and user_type required" });
    }

    const tickets = await SupportTicket.find({ user_id, user_type })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({ success: true, data: tickets });
  } catch (err) {
    console.error("Get tickets error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/support-tickets/:ticketId
   Get single ticket + its messages
───────────────────────────────────────────────────────────── */
router.get("/:ticketId", async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.ticketId).lean();
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

    const messages = await TicketMessage.find({ ticket_id: req.params.ticketId })
      .sort({ createdAt: 1 })
      .lean();

    // Reset user unread when user views the ticket
    await SupportTicket.findByIdAndUpdate(req.params.ticketId, { user_unread: 0 });

    return res.json({ success: true, data: { ticket, messages } });
  } catch (err) {
    console.error("Get ticket detail error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/support-tickets/:ticketId/messages
   Add a message to a ticket (with optional image)
───────────────────────────────────────────────────────────── */
router.post("/:ticketId/messages", upload.single("attachment"), async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

    const { sender_type, sender_name, body } = req.body;
    if (!sender_type || !sender_name) {
      return res.status(400).json({ success: false, message: "sender_type and sender_name required" });
    }
    if (!body?.trim() && !req.file) {
      return res.status(400).json({ success: false, message: "Message body or attachment required" });
    }

    let attachment_url       = null;
    let attachment_public_id = null;

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "scladapp/support_tickets",
        "image"
      );
      attachment_url       = result.url;
      attachment_public_id = result.public_id;
    }

    const message = await TicketMessage.create({
      ticket_id: req.params.ticketId,
      sender_type,
      sender_name,
      body: body?.trim() || "",
      attachment_url,
      attachment_public_id,
    });

    // Update ticket: bump unread for the other side, update status
    const updateFields = { updatedAt: new Date() };
    if (sender_type === "user") {
      updateFields.support_unread = (ticket.support_unread || 0) + 1;
      if (ticket.status === "waiting_reply") updateFields.status = "in_progress";
    } else {
      updateFields.user_unread = (ticket.user_unread || 0) + 1;
      updateFields.status = "waiting_reply";
    }
    await SupportTicket.findByIdAndUpdate(req.params.ticketId, updateFields);

    return res.status(201).json({ success: true, data: message });
  } catch (err) {
    console.error("Add message error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/support-tickets/:ticketId/status
   Update ticket status (support use)
───────────────────────────────────────────────────────────── */
router.patch("/:ticketId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["open", "in_progress", "waiting_reply", "resolved", "closed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.ticketId,
      { status },
      { new: true }
    ).lean();

    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
    return res.json({ success: true, data: ticket });
  } catch (err) {
    console.error("Update status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
