const express = require("express");
const router = express.Router();
const AppFeedback = require("../models/AppFeedback.model");

// POST /api/app-feedback
router.post("/", async (req, res) => {
  try {
    const { user_type, user_id, user_name, user_email, school_id, school_name, type, message } = req.body;

    if (!user_type || !user_id || !user_name || !type || !message) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const feedback = await AppFeedback.create({
      user_type, user_id, user_name, user_email,
      school_id, school_name, type, message,
    });

    return res.status(201).json({ success: true, data: feedback, message: "Feedback submitted" });
  } catch (err) {
    console.error("AppFeedback error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
