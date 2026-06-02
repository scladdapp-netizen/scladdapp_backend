const Notification = require("../models/Notification.model");
const UserNotification = require("../models/UserNotification.model");
const Student = require("../models/Student.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");
const Alumni = require("../models/Alumni.model");
const User = require("../models/User.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");

// POST /api/notifications
exports.createNotification = async (req, res) => {
  try {
    const { school_id, title, resolved_content, template_id, placeholder_values,
            delivery_channels, target_type, targeted_users, created_by_id, created_by_name } = req.body;

    if (!school_id || !title || !resolved_content || !target_type) {
      return res.status(400).json({ success: false, message: "school_id, title, resolved_content, and target_type are required" });
    }

    const notification_id = Date.now().toString();

    const newNotification = await Notification.create({
      notification_id,
      school_id,
      title,
      resolved_content,
      template_id:        template_id || null,
      placeholder_values: placeholder_values || {},
      delivery_channels:  delivery_channels || [],
      target_type,
      created_by_id:      created_by_id || null,
      created_by_name:    created_by_name || null,
    });

    const recipients = Array.isArray(targeted_users) ? targeted_users : [];
    const deliveredAt = new Date();

    if (recipients.length > 0) {
      const userNotifDocs = recipients.map((recipient, index) => ({
        user_notification_id: (Date.now() + index + 1).toString(),
        notification_id,
        school_id,
        user_id:      recipient.id,
        user_name:    recipient.name || null,
        user_type:    (recipient.type || "unknown").toLowerCase(),
        is_read:      false,
        read_at:      null,
        delivered_at: deliveredAt,
      }));
      await UserNotification.insertMany(userNotifDocs);
    }

    console.log(`Notification ${notification_id} created → ${recipients.length} recipients`);
    res.status(201).json({
      success: true,
      message: "Notification created and delivered successfully",
      data: { notification: newNotification, recipients_count: recipients.length },
    });
  } catch (error) {
    console.error("Create notification error:", error);
    res.status(500).json({ success: false, message: "Failed to create notification", error: error.message });
  }
};

// GET /api/notifications/school/:schoolId/paginated
exports.getNotificationsBySchoolPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 15, search = "", searchField = "" } = req.query;

    const query = { school_id: schoolId };
    if (search) {
      const q = { $regex: search, $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? q
        : [{ title: q }, { target_type: q }, { created_by_name: q }];
    }

    const pageNum    = parseInt(page);
    const limitNum   = parseInt(limit);
    const totalRecords = await Notification.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    const notifIds = notifications.map((n) => n.notification_id);
    const userNotifs = await UserNotification.find({ notification_id: { $in: notifIds } }).lean();

    const countMap = {};
    const readMap  = {};
    userNotifs.forEach((un) => {
      countMap[un.notification_id] = (countMap[un.notification_id] || 0) + 1;
      if (un.is_read) readMap[un.notification_id] = (readMap[un.notification_id] || 0) + 1;
    });

    const data = notifications.map((n) => ({
      ...n,
      recipients_count: countMap[n.notification_id] || 0,
      read_count:       readMap[n.notification_id]  || 0,
    }));

    res.json({
      success: true, data,
      pagination: { currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/notifications/:notificationId/recipients/paginated
exports.getRecipientsPaginated = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { page = 1, limit = 15, search = "" } = req.query;

    const query = { notification_id: notificationId };
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ user_name: q }, { user_type: q }];
    }

    const pageNum    = parseInt(page);
    const limitNum   = parseInt(limit);
    const totalRecords = await UserNotification.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const pageData = await UserNotification.find(query).skip(startIndex).limit(limitNum).lean();

    res.json({
      success: true, data: pageData,
      pagination: { currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/notifications/school/:schoolId
exports.getNotificationsBySchool = async (req, res) => {
  try {
    const notifications = await Notification.find({ school_id: req.params.schoolId }).lean();
    res.json({ success: true, data: notifications, count: notifications.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/notifications/:notificationId
exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findOne({ notification_id: req.params.notificationId }).lean();
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/notifications/user/:userId
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const userNotifs = await UserNotification.find({ user_id: userId }).lean();

    const notifIds = userNotifs.map((un) => un.notification_id);
    const notifications = await Notification.find({ notification_id: { $in: notifIds } }).lean();
    const notifMap = {};
    notifications.forEach((n) => { notifMap[n.notification_id] = n; });

    const inbox = userNotifs.map((un) => ({ ...un, notification: notifMap[un.notification_id] || null }));
    res.json({ success: true, data: inbox, count: inbox.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/notifications/user/:userId/paginated
exports.getUserNotificationsPaginated = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 15, search = "" } = req.query;

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);

    // Match by user_id OR reference_id
    let userNotifs = await UserNotification.find({
      $or: [{ user_id: userId }, { reference_id: userId }],
    }).lean();

    const notifIds = userNotifs.map((un) => un.notification_id);
    const notifications = await Notification.find({ notification_id: { $in: notifIds } }).lean();
    const notifMap = {};
    notifications.forEach((n) => { notifMap[n.notification_id] = n; });

    if (search) {
      const q = search.toLowerCase();
      userNotifs = userNotifs.filter((un) => {
        const n = notifMap[un.notification_id];
        return (n?.title || "").toLowerCase().includes(q) || (n?.target_type || "").toLowerCase().includes(q);
      });
    }

    userNotifs.sort((a, b) => {
      const na = notifMap[a.notification_id];
      const nb = notifMap[b.notification_id];
      return new Date(nb?.created_at || 0) - new Date(na?.created_at || 0);
    });

    const totalRecords = userNotifs.length;
    const totalPages   = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex   = (pageNum - 1) * limitNum;
    const pageData     = userNotifs.slice(startIndex, startIndex + limitNum);

    const data = pageData.map((un) => {
      const n = notifMap[un.notification_id] || {};
      return {
        user_notification_id: un.user_notification_id,
        notification_id:      un.notification_id,
        title:                n.title || "—",
        target_type:          n.target_type || "—",
        delivery_channels:    Array.isArray(n.delivery_channels) ? n.delivery_channels.join(", ") : n.delivery_channels || "—",
        created_by_name:      n.created_by_name || "—",
        created_at:           n.created_at || null,
        is_read:              un.is_read,
        read_at:              un.read_at,
        delivered_at:         un.delivered_at,
      };
    });

    res.json({
      success: true, data,
      pagination: { currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/notifications/user/:userNotificationId/read
exports.markAsRead = async (req, res) => {
  try {
    const un = await UserNotification.findOne({ user_notification_id: req.params.userNotificationId });
    if (!un) return res.status(404).json({ success: false, message: "Record not found" });

    un.is_read = true;
    un.read_at = new Date();
    await un.save();

    res.json({ success: true, message: "Marked as read", data: un });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/notifications/:notificationId
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndDelete({ notification_id: notificationId });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

    await UserNotification.deleteMany({ notification_id: notificationId });
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
