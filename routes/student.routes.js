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
const { sendEmailFromTemplate } = require("../utils/sendEmail");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const User = require("../models/User.model");
const School = require("../models/School.model");

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

    // Fetch school info for the invite email (non-blocking)
    const school = await School.findOne({ school_id: body.school_id }).lean().catch(() => null);
    const schoolLogoRaw = school?.logo_url;
    const schoolLogo = typeof schoolLogoRaw === "string"
      ? schoolLogoRaw
      : schoolLogoRaw?.url || schoolLogoRaw?.secure_url || "";

    // Send invite email (non-blocking)
    sendEmailFromTemplate(
      "student_invite",
      {
        fullName:     body.fullName,
        setPasswordUrl,
        schoolName:   school?.school_name || "Your School",
        schoolSlogan: school?.motto       || "",
        schoolLogo,
      },
      { to: body.email, displayName: school?.school_name || "ScladApp" }
    ).catch((err) => console.error("Failed to send student invite email:", err.message));

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

// POST /student/:studentId/resend-invite — regenerate token and resend password setup email
router.post("/:studentId/resend-invite", async (req, res) => {
  try {
    const { studentId } = req.params;
    const Student = require("../models/Student.model");

    const student = await Student.findOne({ student_id: studentId }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!student.email) return res.status(400).json({ success: false, message: "Student has no email address" });

    // Invalidate existing unused tokens
    await PasswordResetToken.updateMany(
      { user_id: studentId, user_type: "student", used: false },
      { $set: { used: true } }
    );

    // Generate new token (48h)
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await PasswordResetToken.create({
      token,
      user_id:   studentId,
      user_type: "student",
      email:     student.email,
      expires_at: expiresAt,
    });

    const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${token}`;

    // Fetch school info for the invite email
    const school = await School.findOne({ school_id: student.school_id }).lean().catch(() => null);
    const schoolLogoRaw = school?.logo_url;
    const schoolLogo = typeof schoolLogoRaw === "string"
      ? schoolLogoRaw
      : schoolLogoRaw?.url || schoolLogoRaw?.secure_url || "";

    // Send invite email (non-blocking)
    sendEmailFromTemplate(
      "student_invite",
      {
        fullName:     student.full_name,
        setPasswordUrl,
        schoolName:   school?.school_name || "Your School",
        schoolSlogan: school?.motto       || "",
        schoolLogo,
      },
      { to: student.email, displayName: school?.school_name || "ScladApp" }
    ).catch((err) => console.error("Failed to send student resend invite email:", err.message));

    return res.json({ success: true, message: `Invite link sent to ${student.email}` });
  } catch (error) {
    console.error("Student resend invite error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to resend invite" });
  }
});

module.exports = router;
