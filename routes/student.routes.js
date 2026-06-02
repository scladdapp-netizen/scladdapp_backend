const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
  createStudent,
  updateStudent,
  getStudentById,
  getStudentDetail,
  getStudentsBySchoolId,
  deleteStudent,
  updateStudentStatus,
  enrollExistingStudent,
} = require("../controllers/student.controller");
const {
  getStudentsBySchoolIdPaginated,
} = require("../controllers/student.controller.paginated");
const { logActivity } = require("../controllers/staff_activity.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { sendEmail } = require("../utils/sendEmail");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const User = require("../models/User.model");

const upload = multer({ storage: multer.memoryStorage() });

// Create student
router.post("/", upload.single("profile_photo"), async (req, res) => {
  try {
    // Parse JSON-stringified fields sent via FormData
    const body = { ...req.body };
    ["guardians"].forEach((key) => {
      if (body[key] && typeof body[key] === "string") {
        try { body[key] = JSON.parse(body[key]); } catch {}
      }
    });

    // Upload photo to Cloudinary if provided
    if (req.file) {
      const { url } = await uploadToCloudinary(req.file.buffer, "scladapp/student_photos", "image");
      body.studentPhoto = url;
    }

    // Set a random dummy password — student will set their own via email link
    body.password = crypto.randomBytes(32).toString("hex");

    console.log("Student route body keys:", Object.keys(body));
    const result = await createStudent(body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Create User record in MongoDB
    const hashedPassword = await bcrypt.hash(body.password, 10);
    await User.create({
      user_id:      (Date.now() + 2).toString(),
      user_type:    "student",
      reference_id: result.data.student_id,
      email:        body.email.toLowerCase().trim(),
      password:     hashedPassword,
      is_active:    true,
    });

    // Generate password-set token (expires in 48h)
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await PasswordResetToken.create({
      token,
      user_id:    result.data.student_id,
      user_type:  "student",
      email:      body.email.toLowerCase().trim(),
      expires_at: expiresAt,
    });

    const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    // Send invite email
    try {
      await sendEmail({
        to:      body.email,
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
  <span class="dc"></span><span class="db"></span>
  <div class="card">
    <div class="icon-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    </div>
    <div class="brand">ScladApp</div>
    <div class="name-tag">Welcome, ${body.fullName}</div>
    <h1>Your student account is ready</h1>
    <p>You've been enrolled at your school on ScladApp. Click the button below to set your password and activate your account.</p>
    <div class="btn-wrap">
      <a href="${setPasswordUrl}" class="btn">Set My Password &rarr;</a>
    </div>
    <div class="detail-row">
      <div class="detail-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </div>
      <div>
        <div class="detail-label">Email</div>
        <div class="detail-val">${body.email}</div>
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
      });
      console.log(`Student invite email sent to ${body.email}`);
    } catch (emailErr) {
      console.error("Failed to send student invite email:", emailErr.message);
    }

    logActivity(
      body.created_by || "system",
      body.school_id,
      "CREATE_STUDENT",
      "Students",
      `Created student "${body.fullName}" (${result.data?.student?.admission_number || ""})`,
      "success",
      "admin"
    );

    return res.status(201).json({
      ...result,
      message: "Student created. A password setup link has been sent to their email.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Update student
router.put("/:studentId", async (req, res) => {
  try {
    const result = await updateStudent(req.params.studentId, req.body);
    if (result.success) {
      logActivity(
        req.body.modified_by || "system",
        result.data?.student?.school_id,
        "EDIT_STUDENT",
        "Students",
        `Updated student "${result.data?.student?.full_name}" (${req.params.studentId})`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get student by ID
router.get("/:studentId", async (req, res) => {
  try {
    const result = await getStudentById(req.params.studentId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get student detail with admissions and guardians
router.get("/:studentId/detail", async (req, res) => {
  try {
    const result = await getStudentDetail(req.params.studentId, req.query.schoolId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get all students by school ID with pagination
router.get("/school/:schoolId/paginated", getStudentsBySchoolIdPaginated);

// Get all students by school ID
router.get("/school/:schoolId", async (req, res) => {
  try {
    const result = await getStudentsBySchoolId(req.params.schoolId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Delete student
router.delete("/:studentId", async (req, res) => {
  try {
    // Read student info before deletion for the log
    const { readData } = require("../utils/file");
    const students = readData("./data/students.json");
    const student = students.find((s) => s.student_id === req.params.studentId);

    const result = await deleteStudent(req.params.studentId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        student?.school_id,
        "DELETE_STUDENT",
        "Students",
        `Deleted student "${student?.full_name}" (${req.params.studentId})`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Update student status
router.patch("/:studentId/status", async (req, res) => {
  try {
    const { studentStatus, modified_by, school_id } = req.body;
    const result = await updateStudentStatus(req.params.studentId, studentStatus);
    if (result.success) {
      logActivity(
        modified_by || "system",
        school_id,
        "UPDATE_STUDENT_STATUS",
        "Students",
        `Changed student ${req.params.studentId} status to "${studentStatus}"`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Enroll existing student
router.post("/:studentId/enroll", async (req, res) => {
  try {
    const result = await enrollExistingStudent(req.params.studentId, req.body);
    if (result.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "ENROLL_STUDENT",
        "Students",
        `Enrolled student ${req.params.studentId} into school ${req.body.school_id}`,
        "success",
        "admin"
      );
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

module.exports = router;
