/**
 * Staff Management API Routes
 *
 * POST   /staff              - Create new staff member
 * PUT    /staff/:staffId     - Update existing staff member
 * GET    /staff/:staffId     - Get staff member by ID
 * GET    /staff/school/:schoolId - Get all staff members for a school
 * DELETE /staff/:staffId     - Delete staff member (soft delete)
 *
 * When creating staff:
 * 1. Staff record is created first in staff.json
 * 2. User record is created in users.json for login (if password provided)
 *
 * Required fields for creation:
 * - fullName, email, phone, position, department, school_id
 *
 * Optional fields include all personal, employment, financial, emergency contact,
 * next of kin, and security information from the StaffFormPanel
 */

const express = require("express");
const multer  = require("multer");
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const {
  createStaff,
  updateStaff,
  getStaffById,
  getStaffDetail,
  getStaffBySchoolId,
  deleteStaff,
} = require("../controllers/staff.controller");
const {
  getStaffBySchoolIdPaginated,
} = require("../controllers/staff.controller.paginated");
const { logActivity } = require("../controllers/staff_activity.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { sendEmail } = require("../utils/sendEmail");
const PasswordResetToken = require("../models/PasswordResetToken.model");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST route for creating staff
router.post("/", upload.single("staff_photo"), async (req, res) => {
  try {
    const staffData = req.body;

    // Upload photo to Cloudinary if provided
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, "scladapp/staff_photos");
        staffData.staffPhoto = result.url;
      } catch (uploadErr) {
        console.error("Cloudinary upload error:", uploadErr.message);
        // Non-fatal — continue without photo
      }
    }

    // Validation
    if (
      !staffData.fullName ||
      !staffData.email ||
      !staffData.phone ||
      !staffData.position ||
      !staffData.department ||
      !staffData.school_id
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message:
          "Full name, email, phone, position, department, and school_id are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(staffData.email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
        message: "Please provide a valid email address",
      });
    }

    // Set a random dummy password — staff will set their own via email link
    staffData.password = crypto.randomBytes(32).toString("hex");

    // Use controller to create staff
    const result = await createStaff(staffData);

    if (!result.success) {
      const statusCode =
        result.error === "Staff already exists" ||
        result.error === "User already exists" ||
        result.error === "Missing required fields"
          ? 400
          : 500;
      return res.status(statusCode).json(result);
    }

    // Generate a password-set token (expires in 48h)
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await PasswordResetToken.create({
      token,
      user_id:   result.data.staff_id,
      user_type: "staff",
      email:     staffData.email.toLowerCase().trim(),
      expires_at: expiresAt,
    });

    const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    // Send invite email (non-blocking — don't fail the request if email fails)
    sendEmail({
      to:      staffData.email,
      subject: "Welcome to ScladApp — Set your password",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Welcome to ScladApp</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 20px}
.wrap{max-width:520px;margin:0 auto;position:relative}
.wrap::before{content:"";position:absolute;width:160px;height:160px;border-radius:50%;border:20px solid rgba(0,0,0,0.04);top:-50px;right:-40px;pointer-events:none}
.wrap::after{content:"";position:absolute;width:60px;height:60px;border-radius:10px;border:2px solid rgba(0,0,0,0.05);bottom:20px;right:50px;transform:rotate(22deg);pointer-events:none}
.dc{position:absolute;width:100px;height:100px;border-radius:50%;border:12px solid rgba(0,0,0,0.03);bottom:-30px;left:-20px;pointer-events:none}
.db{position:absolute;width:36px;height:36px;border-radius:7px;border:1.5px solid rgba(0,0,0,0.06);top:16px;left:160px;transform:rotate(14deg);pointer-events:none}
.card{position:relative;z-index:1;background:#fff;border-radius:16px;padding:40px 36px;border:1px solid #e8e8e8;overflow:hidden}
.card::before{content:"";position:absolute;width:110px;height:110px;border-radius:50%;border:14px solid rgba(0,0,0,0.03);top:-35px;right:-25px;pointer-events:none}
.icon-wrap{width:48px;height:48px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
h1{font-size:22px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1.15;margin-bottom:12px}
p{font-size:14px;color:#666;line-height:1.6;margin-bottom:0}
.name-tag{display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px;letter-spacing:.02em}
.btn-wrap{margin:28px 0}
.btn{display:inline-block;padding:13px 32px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.divider{height:1px;background:#e8e8e8;margin:24px 0}
.note{font-size:12px;color:#bbb;line-height:1.5}
.detail-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f5f5f5;border-radius:10px;margin-bottom:10px}
.detail-icon{width:32px;height:32px;border-radius:8px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.detail-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#888;margin-bottom:2px}
.detail-val{font-size:13px;font-weight:600;color:#111}
</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <span class="db"></span>
  <div class="card">
    <div class="icon-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </div>
    <div class="brand">ScladApp</div>
    <div class="name-tag">Welcome, ${staffData.fullName}</div>
    <h1>Your account is ready</h1>
    <p>You've been added to <strong>${staffData.school_id ? "your school" : "ScladApp"}</strong> as a staff member. Click the button below to set your password and activate your account.</p>

    <div class="btn-wrap">
      <a href="${setPasswordUrl}" class="btn">Set My Password &rarr;</a>
    </div>

    <div class="detail-row">
      <div class="detail-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </div>
      <div>
        <div class="detail-label">Email</div>
        <div class="detail-val">${staffData.email}</div>
      </div>
    </div>

    <div class="detail-row">
      <div class="detail-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div>
        <div class="detail-label">Link expires</div>
        <div class="detail-val">48 hours from now</div>
      </div>
    </div>

    <div class="divider"></div>
    <p class="note">If you didn't expect this email, you can safely ignore it. This link can only be used once.</p>
    <p class="note" style="margin-top:8px">ScladApp &nbsp;·&nbsp; School Management Platform</p>
  </div>
</div>
</body>
</html>`,
    }).catch((err) => console.error("Failed to send invite email:", err.message));

    logActivity(
      staffData.created_by || "system",
      staffData.school_id,
      "CREATE_STAFF",
      "Staff",
      `Created staff member "${staffData.fullName}" (${staffData.position})`,
      "success",
      "admin"
    );

    return res.status(201).json({
      ...result,
      message: "Staff member created. A password setup link has been sent to their email.",
    });
  } catch (error) {
    console.error("Create staff route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while creating staff member",
    });
  }
});

// PUT route for updating staff
router.put("/:staffId", upload.single("staff_photo"), async (req, res) => {
  try {
    const { staffId } = req.params;
    const staffData = req.body;

    // Upload new photo to Cloudinary if provided
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, "scladapp/staff_photos");
        staffData.staffPhoto = result.url;
      } catch (uploadErr) {
        console.error("Cloudinary upload error:", uploadErr.message);
      }
    }

    // Validate staff ID
    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "Missing staff ID",
        message: "Staff ID is required",
      });
    }

    // Validate email format if provided
    if (staffData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(staffData.email)) {
        return res.status(400).json({
          success: false,
          error: "Invalid email format",
          message: "Please provide a valid email address",
        });
      }
    }

    // Use controller to update staff (handles all business logic and database checks)
    const result = await updateStaff(staffId, staffData);

    if (!result.success) {
      // Return appropriate status code based on error type
      const statusCode =
        result.error === "Staff not found"
          ? 404
          : result.error === "Email already exists"
          ? 400
          : 500;

      return res.status(statusCode).json(result);
    }

    logActivity(
      staffData.modified_by || "system",
      result.data?.staff?.school_id,
      "EDIT_STAFF",
      "Staff",
      `Updated staff member "${result.data?.staff?.full_name}" (${staffId})`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Update staff route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while updating staff member",
    });
  }
});

// GET route for getting staff detail with teacher assignment (MUST BE BEFORE /:staffId)
router.get("/:staffId/detail", async (req, res) => {
  try {
    const { staffId } = req.params;

    // Validate staff ID
    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "Missing staff ID",
        message: "Staff ID is required",
      });
    }

    // Get staff detail
    const result = await getStaffDetail(staffId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get staff detail route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving staff detail",
    });
  }
});

// GET route for getting staff by ID
router.get("/:staffId", async (req, res) => {
  try {
    const { staffId } = req.params;

    // Validate staff ID
    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "Missing staff ID",
        message: "Staff ID is required",
      });
    }

    // Get staff
    const result = await getStaffById(staffId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get staff route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving staff member",
    });
  }
});

// GET route for getting all staff by school ID with pagination (NEW - server-side pagination)
router.get("/school/:schoolId/paginated", getStaffBySchoolIdPaginated);

// GET route for getting all staff by school ID (OLD - returns all staff)
router.get("/school/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;

    // Validate school ID
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: "Missing school ID",
        message: "School ID is required",
      });
    }

    // Get staff
    const result = await getStaffBySchoolId(schoolId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get school staff route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving staff members",
    });
  }
});

// DELETE route for deleting staff (soft delete)
router.delete("/:staffId", async (req, res) => {
  try {
    const { staffId } = req.params;

    // Validate staff ID
    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "Missing staff ID",
        message: "Staff ID is required",
      });
    }

    // Delete staff
    const result = await deleteStaff(staffId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logActivity(
      req.body?.deleted_by || "system",
      result.data?.school_id,
      "DELETE_STAFF",
      "Staff",
      `Deleted staff member ${staffId}`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Delete staff route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while deleting staff member",
    });
  }
});

// POST /staff/:staffId/resend-invite — regenerate token and resend password setup email
router.post("/:staffId/resend-invite", async (req, res) => {
  try {
    const { staffId } = req.params;
    const Staff = require("../models/Staff.model");
    const User  = require("../models/User.model");

    const staffMember = await Staff.findOne({ staff_id: staffId }).lean();
    if (!staffMember) return res.status(404).json({ success: false, message: "Staff member not found" });

    // Invalidate any existing unused tokens for this staff
    await PasswordResetToken.updateMany(
      { user_id: staffId, user_type: "staff", used: false },
      { $set: { used: true } }
    );

    // Generate new token (48h)
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await PasswordResetToken.create({
      token,
      user_id:    staffId,
      user_type:  "staff",
      email:      staffMember.email,
      expires_at: expiresAt,
    });

    const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    await sendEmail({
      to:      staffMember.email,
      subject: "ScladApp — Your new password setup link",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Password Setup — ScladApp</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 20px}
.wrap{max-width:520px;margin:0 auto;position:relative}
.wrap::before{content:"";position:absolute;width:160px;height:160px;border-radius:50%;border:20px solid rgba(0,0,0,0.04);top:-50px;right:-40px;pointer-events:none}
.wrap::after{content:"";position:absolute;width:60px;height:60px;border-radius:10px;border:2px solid rgba(0,0,0,0.05);bottom:20px;right:50px;transform:rotate(22deg);pointer-events:none}
.dc{position:absolute;width:100px;height:100px;border-radius:50%;border:12px solid rgba(0,0,0,0.03);bottom:-30px;left:-20px;pointer-events:none}
.db{position:absolute;width:36px;height:36px;border-radius:7px;border:1.5px solid rgba(0,0,0,0.06);top:16px;left:160px;transform:rotate(14deg);pointer-events:none}
.card{position:relative;z-index:1;background:#fff;border-radius:16px;padding:40px 36px;border:1px solid #e8e8e8;overflow:hidden}
.card::before{content:"";position:absolute;width:110px;height:110px;border-radius:50%;border:14px solid rgba(0,0,0,0.03);top:-35px;right:-25px;pointer-events:none}
.icon-wrap{width:48px;height:48px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
h1{font-size:22px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1.15;margin-bottom:12px}
p{font-size:14px;color:#666;line-height:1.6;margin-bottom:0}
.name-tag{display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px;letter-spacing:.02em}
.btn-wrap{margin:28px 0}
.btn{display:inline-block;padding:13px 32px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.divider{height:1px;background:#e8e8e8;margin:24px 0}
.note{font-size:12px;color:#bbb;line-height:1.5}
.detail-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f5f5f5;border-radius:10px;margin-bottom:10px}
.detail-icon{width:32px;height:32px;border-radius:8px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.detail-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#888;margin-bottom:2px}
.detail-val{font-size:13px;font-weight:600;color:#111}
</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <span class="db"></span>
  <div class="card">
    <div class="icon-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
    </div>
    <div class="brand">ScladApp</div>
    <div class="name-tag">Hello, ${staffMember.full_name}</div>
    <h1>New password setup link</h1>
    <p>A new invitation link has been sent to you. Click the button below to set your password and activate your ScladApp account.</p>
    <div class="btn-wrap">
      <a href="${setPasswordUrl}" class="btn">Set My Password &rarr;</a>
    </div>
    <div class="detail-row">
      <div class="detail-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div>
        <div class="detail-label">Link expires</div>
        <div class="detail-val">48 hours from now</div>
      </div>
    </div>
    <div class="divider"></div>
    <p class="note">If you didn't expect this email, you can safely ignore it. This link can only be used once.</p>
    <p class="note" style="margin-top:8px">ScladApp &nbsp;·&nbsp; School Management Platform</p>
  </div>
</div>
</body>
</html>`,
    });

    return res.json({ success: true, message: `Invite link sent to ${staffMember.email}` });
  } catch (error) {
    console.error("Resend invite error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to resend invite" });
  }
});

// PATCH /staff/:staffId/record-status
router.patch("/:staffId/record-status", async (req, res) => {
  try {
    const { staffId } = req.params;
    const { recordStatus } = req.body;

    // Validate staff ID
    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "Missing staff ID",
        message: "Staff ID is required",
      });
    }

    // Validate record status
    if (!recordStatus || !["active", "inactive"].includes(recordStatus)) {
      return res.status(400).json({
        success: false,
        error: "Invalid record status",
        message: "Record status must be either 'active' or 'inactive'",
      });
    }

    // Update staff record status
    const result = await updateStaff(staffId, { recordStatus });

    if (!result.success) {
      const statusCode = result.error === "Staff not found" ? 404 : 500;
      return res.status(statusCode).json(result);
    }

    logActivity(
      req.body?.modified_by || "system",
      result.data?.staff?.school_id,
      recordStatus === "active" ? "ACTIVATE_STAFF" : "DEACTIVATE_STAFF",
      "Staff",
      `Changed staff ${staffId} record status to "${recordStatus}"`,
      "success",
      "admin"
    );

    return res.status(200).json({
      success: true,
      data: result.data,
      message: `Staff record status updated to ${recordStatus}`,
    });
  } catch (error) {
    console.error("Update staff record status route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while updating staff record status",
    });
  }
});

module.exports = router;
