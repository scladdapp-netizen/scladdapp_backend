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
const { sendEmailFromTemplate } = require("../utils/sendEmail");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const School = require("../models/School.model");
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

    // Fetch school info for the invite email (non-blocking)
    const school = await School.findOne({ school_id: staffData.school_id }).lean().catch(() => null);
    const schoolLogoRaw = school?.logo_url;
    const schoolLogo = typeof schoolLogoRaw === "string"
      ? schoolLogoRaw
      : schoolLogoRaw?.url || schoolLogoRaw?.secure_url || "";

    sendEmailFromTemplate(
      "staff_invite",
      {
        fullName:      staffData.fullName,
        setPasswordUrl,
        schoolName:    school?.school_name  || "Your School",
        schoolSlogan:  school?.motto        || "",
        schoolLogo,
      },
      { to: staffData.email, displayName: school?.school_name || "ScladApp" }
    ).catch((err) => console.error("Failed to send staff invite email:", err.message));

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
    const Staff  = require("../models/Staff.model");

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

    // Fetch school info for the invite email
    const school = await School.findOne({ school_id: staffMember.school_id }).lean().catch(() => null);
    const schoolLogoRaw = school?.logo_url;
    const schoolLogo = typeof schoolLogoRaw === "string"
      ? schoolLogoRaw
      : schoolLogoRaw?.url || schoolLogoRaw?.secure_url || "";

    // Send invite email (non-blocking)
    sendEmailFromTemplate(
      "staff_invite",
      {
        fullName:     staffMember.full_name,
        setPasswordUrl,
        schoolName:   school?.school_name || "Your School",
        schoolSlogan: school?.motto       || "",
        schoolLogo,
      },
      { to: staffMember.email, displayName: school?.school_name || "ScladApp" }
    ).catch((err) => console.error("Failed to send resend invite email:", err.message));

    return res.json({ success: true, message: `Invite link sent to ${staffMember.email}` });
  } catch (error) {
    console.error("Resend invite error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to resend invite" });
  }
});

// ── Security: Change Password ─────────────────────────────────────────────
router.post("/:staffId/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { staffId } = req.params;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });

    const Staff = require("../models/Staff.model");
    const User  = require("../models/User.model");

    const staff = await Staff.findOne({ staff_id: staffId });
    if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

    const user = await User.findOne({ reference_id: staffId, user_type: "staff" });
    if (!user) return res.status(404).json({ success: false, message: "User account not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ success: false, message: "Current password is incorrect" });

    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Security: Toggle 2FA ──────────────────────────────────────────────────
router.patch("/:staffId/two-factor-auth", async (req, res) => {
  try {
    const { enabled } = req.body;
    const { staffId } = req.params;

    const Staff = require("../models/Staff.model");
    const staff = await Staff.findOne({ staff_id: staffId });
    if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

    staff.two_factor_auth = !!enabled;
    staff.updated_at = new Date();
    await staff.save();

    res.json({ success: true, message: `2FA ${enabled ? "enabled" : "disabled"}`, data: { two_factor_auth: staff.two_factor_auth } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
