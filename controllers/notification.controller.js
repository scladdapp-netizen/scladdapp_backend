const Notification = require("../models/Notification.model");
const UserNotification = require("../models/UserNotification.model");
const Student = require("../models/Student.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");
const Alumni = require("../models/Alumni.model");
const User = require("../models/User.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const StudentGuardian = require("../models/StudentGuardian.model");
const School = require("../models/School.model");
const AnnouncementTemplate = require("../models/AnnouncementTemplate.model");
const { queueEmail } = require("../utils/emailQueue");

// ── Convert a TipTap JSON doc to HTML (mirrors the frontend docToHtml) ────────
const docToHtml = (doc) => {
  if (!doc?.content) return "";
  const renderNode = (node) => {
    if (node.type === "text") {
      let t = (node.text || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const marks = node.marks || [];
      if (marks.find(m => m.type === "bold"))      t = `<strong>${t}</strong>`;
      if (marks.find(m => m.type === "italic"))     t = `<em>${t}</em>`;
      if (marks.find(m => m.type === "underline"))  t = `<u>${t}</u>`;
      if (marks.find(m => m.type === "strike"))     t = `<s>${t}</s>`;
      const ts = marks.find(m => m.type === "textStyle");
      if (ts?.attrs?.color) t = `<span style="color:${ts.attrs.color}">${t}</span>`;
      return t;
    }
    if (node.type === "image") {
      const w = node.attrs?.width  ? ` width="${node.attrs.width}"`  : "";
      const h = node.attrs?.height ? ` height="${node.attrs.height}"` : "";
      return `<img src="${node.attrs?.src || ""}" alt="${node.attrs?.alt || ""}"${w}${h} style="max-width:100%;height:auto;border-radius:4px;display:block;margin:6px auto"/>`;
    }
    const inner = (node.content || []).map(renderNode).join("");
    const align = node.attrs?.textAlign;
    const aStyle = align ? `text-align:${align};` : "";
    if (node.type === "paragraph")   return `<p style="margin:0 0 6px;${aStyle}">${inner || "&nbsp;"}</p>`;
    if (node.type === "heading")     return `<h${node.attrs?.level || 2} style="margin:0 0 8px;${aStyle}">${inner}</h${node.attrs?.level || 2}>`;
    if (node.type === "bulletList")  return `<ul style="margin:4px 0 4px 18px;padding:0">${inner}</ul>`;
    if (node.type === "orderedList") return `<ol style="margin:4px 0 4px 18px;padding:0">${inner}</ol>`;
    if (node.type === "listItem")    return `<li style="margin-bottom:3px">${inner}</li>`;
    if (node.type === "hardBreak")   return `<br/>`;
    return inner;
  };
  return (doc.content || []).map(renderNode).join("");
};

// Is a hex colour dark?
const isDark = (hex = "#000000") => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2) || "00", 16);
  const g = parseInt(h.slice(2, 4) || "00", 16);
  const b = parseInt(h.slice(4, 6) || "00", 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
};

// Build a section's inline HTML (mirrors frontend buildPreviewSection)
const buildSection = (html, bg, bgImg, overlay) => {
  if (bgImg) {
    const tint = overlay > 0
      ? `rgba(0,0,0,${overlay})`
      : overlay < 0
        ? `rgba(255,255,255,${Math.abs(overlay)})`
        : "transparent";
    return `<div style="position:relative;background-image:url(${bgImg});background-size:cover;background-position:center;padding:22px 28px">
      <div style="position:absolute;inset:0;background:${tint};pointer-events:none"></div>
      <div style="position:relative;z-index:1;color:#ffffff">${html}</div>
    </div>`;
  }
  return `<div style="background:${bg};padding:22px 28px;color:${isDark(bg) ? "#ffffff" : "#1e293b"}">${html}</div>`;
};

/**
 * Strip blue/yellow placeholder styling spans from HTML, keeping their text.
 * Handles both class="placeholder-tag" spans and any span with the known
 * blue (#dbeafe / #1e40af) or yellow (#fef3c7) background inline styles.
 */
const stripPlaceholderStyles = (html) => {
  if (!html) return html;
  // Remove styled spans — replace with just their inner text/content
  return html
    // class="placeholder-tag" spans
    .replace(/<span[^>]*class="placeholder-tag"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    // inline-styled spans with the known blue/yellow background colours
    .replace(/<span[^>]*style="[^"]*background\s*:\s*#(?:dbeafe|fef3c7)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1");
};

/**
 * Build the full email HTML from a stored html_template JSON + resolved_content.
 * Falls back to resolved_content alone if the template has no layout.
 */
const buildEmailHtml = (htmlTemplateRaw, resolvedContent) => {
  try {
    const stored = typeof htmlTemplateRaw === "string"
      ? JSON.parse(htmlTemplateRaw)
      : htmlTemplateRaw;

    if (!stored?.top_doc && !stored?.bottom_doc) return resolvedContent;

    const topHtml    = stored.top_doc    ? docToHtml(stored.top_doc)    : "";
    const bottomHtml = stored.bottom_doc ? docToHtml(stored.bottom_doc) : "";

    const topSection    = buildSection(topHtml,    stored.top_bg    || "#1e293b", stored.top_bg_img    || null, stored.top_overlay    ?? 0.4);
    const bottomSection = buildSection(bottomHtml, stored.bottom_bg || "#f9fafb", stored.bottom_bg_img || null, stored.bottom_overlay ?? 0);

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:32px 16px}</style>
    </head><body>
      <div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        ${topSection}
        <div style="padding:24px 28px;background:#ffffff;border-top:2px solid #e5e7eb;border-bottom:2px solid #e5e7eb">
          ${resolvedContent}
        </div>
        ${bottomSection}
      </div>
    </body></html>`;
  } catch {
    return resolvedContent;
  }
};

// ── Resolve email for a recipient by their type and id ────────────────────────
const resolveEmail = async (userId, userType) => {
  try {
    const t = (userType || "").toLowerCase();
    if (t === "student") {
      const s = await Student.findOne({ student_id: userId }).lean();
      return s?.email || null;
    }
    if (t === "staff" || t === "teacher") {
      const s = await Staff.findOne({ staff_id: userId }).lean();
      return s?.email || null;
    }
    if (t === "alumni") {
      const a = await Alumni.findOne({ student_id: userId }).lean();
      return a?.contact_email || null;
    }
    if (t === "guardian") {
      const g = await StudentGuardian.findOne({ guardian_id: userId }).lean();
      return g?.guardian_email || null;
    }
    return null;
  } catch {
    return null;
  }
};

// POST /api/notifications
exports.createNotification = async (req, res) => {
  try {
    const { school_id, title, resolved_content, template_id, placeholder_values,
            delivery_channels, target_type, targeted_users, created_by_id, created_by_name } = req.body;

    if (!school_id || !title || !resolved_content || !target_type) {
      return res.status(400).json({ success: false, message: "school_id, title, resolved_content, and target_type are required" });
    }

    const notification_id = Date.now().toString();
    const sendEmailChannel = Array.isArray(delivery_channels) && delivery_channels.includes("Email");

    // Fetch school info for email sender details (non-fatal if missing)
    let school = null;
    if (sendEmailChannel) {
      school = await School.findOne({ school_id }).lean().catch(() => null);
    }
    const schoolName  = school?.school_name  || created_by_name || "ScladApp";
    const schoolEmail = school?.email        || null;

    // Fetch the announcement template's html_template for the email layout
    let emailHtml = resolved_content; // fallback: just the content
    if (sendEmailChannel && template_id) {
      const tmpl = await AnnouncementTemplate.findOne({ template_id }).lean().catch(() => null);
      const cleanContent = stripPlaceholderStyles(resolved_content);
      if (tmpl?.html_template) {
        emailHtml = buildEmailHtml(tmpl.html_template, cleanContent);
      } else {
        emailHtml = cleanContent;
      }
    }

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
    const titleClean  = title.replace(/<[^>]*>/g, "");

    if (recipients.length > 0) {
      const userNotifDocs = await Promise.all(
        recipients.map(async (recipient, index) => {
          let email_address = recipient.email || null;
          // Resolve email if not provided directly on the recipient object
          if (!email_address) {
            email_address = await resolveEmail(recipient.id, recipient.type);
          }

          let email_sent    = false;
          let email_sent_at = null;

          if (sendEmailChannel && email_address) {
            try {
              const result = await queueEmail({
                to:          email_address,
                subject:     titleClean,
                html:        emailHtml,
                displayName: schoolName,
                replyTo:     schoolEmail || undefined,
              });
              email_sent    = result.sent;
              email_sent_at = result.sent ? new Date() : null;
            } catch (err) {
              console.error(`[notification] Email failed for ${email_address}:`, err.message);
            }
          }

          return {
            user_notification_id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            notification_id,
            school_id,
            user_id:      recipient.id,
            user_name:    recipient.name || null,
            user_type:    (recipient.type || "unknown").toLowerCase(),
            is_read:      false,
            read_at:      null,
            delivered_at: deliveredAt,
            email_address,
            email_sent,
            email_sent_at,
          };
        })
      );

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
    const userNotifs = await UserNotification.find({
      $or: [{ user_id: userId }, { reference_id: userId }],
    }).lean();

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
