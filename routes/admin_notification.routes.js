const express = require("express");
const router  = express.Router();
const AdminNotification = require("../models/AdminNotification.model");

/* ─────────────────────────────────────────────────────────────
   POST /api/admin-notifications
   Create a new admin notification for a school
   Body: { school_id, title, body, type?, created_by_id?, created_by_name? }
───────────────────────────────────────────────────────────── */
router.post("/", async (req, res) => {
  try {
    const { school_id, title, body, type, created_by_id, created_by_name } = req.body;

    if (!school_id || !title || !body) {
      return res.status(400).json({ success: false, message: "school_id, title and body are required" });
    }

    const notif = await AdminNotification.create({
      school_id, title, body,
      type: type || "info",
      created_by_id:   created_by_id   || null,
      created_by_name: created_by_name || null,
      read_by: [],
    });

    return res.status(201).json({ success: true, data: notif });
  } catch (err) {
    console.error("Create admin notification error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admin-notifications/school/:schoolId?admin_id=
   Get all notifications for a school.
   If admin_id is provided, each item includes `is_read` for that admin.
───────────────────────────────────────────────────────────── */
router.get("/school/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { admin_id }  = req.query;

    const notifications = await AdminNotification.find({ school_id: schoolId })
      .sort({ createdAt: -1 })
      .lean();

    const data = notifications.map((n) => ({
      ...n,
      is_read: admin_id
        ? n.read_by.some((r) => r.admin_id === admin_id)
        : false,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Get admin notifications error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admin-notifications/school/:schoolId/unread-count?admin_id=
   Returns just the unread count for a specific admin
───────────────────────────────────────────────────────────── */
router.get("/school/:schoolId/unread-count", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { admin_id }  = req.query;

    if (!admin_id) {
      return res.status(400).json({ success: false, message: "admin_id is required" });
    }

    // Count notifications where this admin's id is NOT in read_by
    const count = await AdminNotification.countDocuments({
      school_id: schoolId,
      "read_by.admin_id": { $ne: admin_id },
    });

    return res.json({ success: true, count });
  } catch (err) {
    console.error("Unread count error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/admin-notifications/:notificationId/read
   Mark a single notification as read for a specific admin
   Body: { admin_id }
───────────────────────────────────────────────────────────── */
router.patch("/:notificationId/read", async (req, res) => {
  try {
    const { admin_id } = req.body;
    if (!admin_id) {
      return res.status(400).json({ success: false, message: "admin_id is required" });
    }

    const notif = await AdminNotification.findById(req.params.notificationId);
    if (!notif) return res.status(404).json({ success: false, message: "Notification not found" });

    // Idempotent — only push if not already in array
    const alreadyRead = notif.read_by.some((r) => r.admin_id === admin_id);
    if (!alreadyRead) {
      notif.read_by.push({ admin_id, read_at: new Date() });
      await notif.save();
    }

    return res.json({ success: true, data: notif });
  } catch (err) {
    console.error("Mark read error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/admin-notifications/school/:schoolId/read-all
   Mark ALL notifications for a school as read for a specific admin
   Body: { admin_id }
───────────────────────────────────────────────────────────── */
router.patch("/school/:schoolId/read-all", async (req, res) => {
  try {
    const { admin_id } = req.body;
    const { schoolId } = req.params;

    if (!admin_id) {
      return res.status(400).json({ success: false, message: "admin_id is required" });
    }

    // Find all unread by this admin
    const unread = await AdminNotification.find({
      school_id: schoolId,
      "read_by.admin_id": { $ne: admin_id },
    });

    const now = new Date();
    await Promise.all(
      unread.map((n) => {
        n.read_by.push({ admin_id, read_at: now });
        return n.save();
      })
    );

    return res.json({ success: true, marked: unread.length });
  } catch (err) {
    console.error("Mark all read error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/admin-notifications/:notificationId
   Delete a notification (admin only)
───────────────────────────────────────────────────────────── */
router.delete("/:notificationId", async (req, res) => {
  try {
    const notif = await AdminNotification.findByIdAndDelete(req.params.notificationId);
    if (!notif) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("Delete admin notification error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
