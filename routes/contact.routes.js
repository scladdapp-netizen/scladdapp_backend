const express = require("express");
const router = express.Router();
const ContactMessage = require("../models/ContactMessage.model");

// POST /api/contact
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const entry = await ContactMessage.create({ name, email, subject, message });

    return res.status(201).json({ success: true, data: entry, message: "Message received" });
  } catch (err) {
    console.error("Contact message error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
