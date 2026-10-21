/**
 * CBT authentication and authorization.
 *
 * Identity comes only from the signed login token. The actor is re-loaded from the database on
 * every request so deactivated accounts and changed roles take effect straight away, and the
 * school id is always the one inside the token, never a value sent by the browser.
 */
const jwt = require("jsonwebtoken");
const CbtAttempt = require("../models/CbtAttempt.model");
const User = require("../models/User.model");
const Admin = require("../models/Admin.model");
const Staff = require("../models/Staff.model");
const Student = require("../models/Student.model");
const Teacher = require("../models/Teacher.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");

const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const loadActor = async (payload) => {
  const schoolId = String(payload.school_id || "");
  if (!schoolId || !payload.user_id) return null;
  const user = await User.findOne({ user_id: payload.user_id, is_active: true }).lean();
  if (!user) return null;
  const type = String(user.user_type || "");

  if (type === "student") {
    const student = await Student.findOne({ student_id: user.reference_id, school_id: schoolId, is_active: true }).lean();
    if (!student) return null;
    return {
      role: "student",
      id: student.student_id,
      name: student.full_name || [student.first_name, student.last_name].filter(Boolean).join(" ") || "",
      schoolId,
    };
  }

  if (type !== "admin" && type !== "staff" && type !== "teacher") return null;

  const admin = type === "admin"
    ? await Admin.findOne({ admin_id: user.reference_id, school_id: schoolId, is_active: true }).lean()
    : await Admin.findOne({ staff_id: user.reference_id, school_id: schoolId, is_active: true }).lean();
  const staffId = type === "admin" ? admin?.staff_id : user.reference_id;
  const staff = staffId ? await Staff.findOne({ staff_id: staffId, school_id: schoolId, is_active: true }).lean() : null;
  if (type === "admin" && !admin) return null;
  if (type !== "admin" && !staff) return null;
  const teacher = staffId ? await Teacher.findOne({ staff_id: staffId, school_id: schoolId, is_active: true }).lean() : null;

  return {
    role: "staff",
    id: admin?.admin_id || staff?.staff_id,
    name: staff?.full_name || admin?.username || "",
    schoolId,
    admin: admin || null,
    teacherId: teacher?.teacher_id || null,
  };
};

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return fail(res, 401, "Please sign in to continue.", "unauthenticated");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return fail(res, 401, "Your session has expired. Please sign in again.", "unauthenticated");
  }
  try {
    const actor = await loadActor(payload);
    if (!actor) return fail(res, 401, "This account is not active.", "unauthenticated");
    req.actor = actor;
    return next();
  } catch (error) {
    console.error("[CBT-AUTH]", error);
    return fail(res, 500, "Could not verify your account.");
  }
};

const requireStaff = (req, res, next) => {
  if (req.actor?.role !== "staff") return fail(res, 403, "You do not have access to this area.", "forbidden");
  return next();
};

const requireStudent = (req, res, next) => {
  if (req.actor?.role !== "student") return fail(res, 403, "This area is for students.", "forbidden");
  return next();
};

/**
 * A sitting link, not a student login. It can only open the one attempt named in the token.
 */
const requireExamLink = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return fail(res, 401, "This exam link is not valid. Check it with your teacher.", "invalid_link");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return fail(res, 401, "This exam link has expired. Ask your teacher to start you again.", "invalid_link");
  }
  if (payload.purpose !== "cbt_link" || !payload.attempt_id || !payload.student_id || !payload.school_id) {
    return fail(res, 401, "This exam link is not valid. Check it with your teacher.", "invalid_link");
  }
  try {
    const attempt = await CbtAttempt.findOne({
      attempt_id: String(payload.attempt_id),
      student_id: String(payload.student_id),
      school_id: String(payload.school_id),
    }).lean();
    if (!attempt) return fail(res, 404, "This exam link is not valid. Check it with your teacher.", "invalid_link");
    req.actor = { role: "student", id: attempt.student_id, schoolId: attempt.school_id, via: "link" };
    req.params.attemptId = attempt.attempt_id;
    return next();
  } catch (error) {
    console.error("[CBT-AUTH]", error);
    return fail(res, 500, "Could not open this exam link.");
  }
};

// ── Subject / class authorization for staff ───────────────────────────────────
const isFullAdmin = (actor) => {
  const admin = actor?.admin;
  if (!admin) return false;
  if (admin.admin_role === "Super Admin") return true;
  const perms = admin.permissions;
  if (Array.isArray(perms)) return perms.includes("ALL");
  return Boolean(perms?.ALL);
};

const adminCan = (actor, mode) => {
  if (!actor?.admin) return false;
  if (isFullAdmin(actor)) return true;
  const subject = actor.admin.permissions?.subject;
  if (!subject) return false;
  return mode === "edit" ? Boolean(subject.edit) : Boolean(subject.edit || subject.view);
};

const teacherAssignments = async (actor, subjectId) => {
  if (!actor?.teacherId) return [];
  return TeacherSubjectAssignment.find({
    school_id: actor.schoolId,
    teacher_id: actor.teacherId,
    subject_id: String(subjectId),
    is_active: true,
  }).lean();
};

/**
 * Class ids this actor may use for the subject. `null` means every class (full access).
 * An empty array means no access at all.
 */
const allowedClassIds = async (actor, subjectId, mode = "edit") => {
  if (adminCan(actor, mode)) return null;
  const rows = await teacherAssignments(actor, subjectId);
  if (rows.length === 0) return [];
  if (rows.some((row) => !row.class_id)) return null;
  return [...new Set(rows.map((row) => String(row.class_id)))];
};

const canUseSubject = async (actor, subjectId, classId, mode = "edit") => {
  const allowed = await allowedClassIds(actor, subjectId, mode);
  if (allowed === null) return true;
  if (!classId) return allowed.length > 0;
  return allowed.includes(String(classId));
};

module.exports = {
  authenticate,
  requireStaff,
  requireStudent,
  requireExamLink,
  isFullAdmin,
  adminCan,
  allowedClassIds,
  canUseSubject,
};
