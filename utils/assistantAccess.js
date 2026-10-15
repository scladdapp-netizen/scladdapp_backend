/**
 * Who is asking the School Assistant, and what may they read.
 *
 * Super Admins (admin_role "Super Admin" or permissions ["ALL"]) read everything. A sub-admin
 * reads only the collections that belong to a section where their permission has read: true,
 * the same keys SubAdminGuard checks on the pages.
 */
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin.model");

class AccessDenied extends Error {
  constructor(message, sections) {
    super(message);
    this.denied = true;
    this.sections = sections || [];
  }
}

// null = Super Admin only. An array means any one of those sections is enough.
const SUPER_ONLY = null;
const COLLECTION_SECTION = {
  Student: "students",
  StudentAttendance: "students",
  StudentMedicalRecord: "students",
  StudentResource: "students",
  StudentClassAssignment: ["students", "classes"],
  StudentScore: "student_report",
  StudentTraitScore: "student_report",
  StudentReport: "student_report",
  StudentReportCard: "student_report",
  ReportCardTheme: "report_template",
  CombinedTemplate: "report_template",
  Class: "classes",
  ClassHeadmaster: "classes",
  ClassResource: "classes",
  ClassSubjectAssignment: ["classes", "subject"],
  ClassTimetable: ["classes", "timetable_template"],
  TimetableTemplate: "timetable_template",
  Subject: "subject",
  SubjectBook: "subject",
  SubjectResource: "subject",
  TeacherSubjectAssignment: ["teachers", "subject"],
  Teacher: "teachers",
  TeacherResource: "teachers",
  TeacherAssignmentHistory: "teachers",
  Staff: "staff",
  StaffPerformance: "staff",
  StaffResource: "staff",
  StaffCredential: "staff",
  StaffActivityLog: "staff",
  Session: "academic_sessions",
  Subsession: "academic_sessions",
  Admission: "academic_sessions",
  SchoolCalendar: "school_calendar",
  SchoolEvent: "school_event",
  Alumni: "graduate",
  AlumniCertificate: "graduate",
  StudentApplication: "applications",
  ApplicationFormConfig: "applications",
  Bill: "bill_income_expense",
  UserBill: "bill_income_expense",
  Transaction: ["bill_income_expense", "school_account"],
  FeeBillTemplate: ["fee_billing_template", "bill_income_expense"],
  SchoolAccount: "school_account",
  Notification: "communication",
  UserNotification: "communication",
  AdminNotification: "communication",
  AnnouncementTemplate: "announcement_template",
  ClassPromotionTemplate: "class_promotion_template",
  Admin: SUPER_ONLY,
  School: SUPER_ONLY,
  SchoolAIToken: SUPER_ONLY,
  SchoolGallery: SUPER_ONLY,
  SchoolResource: SUPER_ONLY,
  Subscription: SUPER_ONLY,
  Payment: SUPER_ONLY,
  SupportTicket: SUPER_ONLY,
  AppFeedback: SUPER_ONLY,
  WebsiteRequest: SUPER_ONLY,
};

// Collections the assistant needs only to turn names into ids (find) or to put a name next to
// a row (join). Everyone who may use the assistant can use them for names, nothing more.
const LOOKUP_COLLECTIONS = new Set(["Student", "Class", "Subject", "Session", "Subsession", "Staff", "Teacher"]);

const sectionLabel = (key) => key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function denialMessage(sections) {
  const where = sections && sections.length
    ? ` (${sections.map((key) => `"${sectionLabel(key)}"`).join(" or ")} section)`
    : "";
  return `You do not have permission to read this data${where}. Ask your Super Admin to give you permission.`;
}

function accessFor(admin) {
  const perms = admin?.permissions;
  const full = !!admin && (
    admin.admin_role === "Super Admin"
    || (Array.isArray(perms) && perms.includes("ALL"))
  );
  const hasRead = (key) => !!perms && typeof perms === "object" && !Array.isArray(perms) && perms[key]?.read === true;
  const sectionsOf = (collection) => (collection in COLLECTION_SECTION ? COLLECTION_SECTION[collection] : SUPER_ONLY);

  const canRead = (collection) => {
    if (full) return true;
    const needs = sectionsOf(collection);
    if (needs === SUPER_ONLY) return false;
    return (Array.isArray(needs) ? needs : [needs]).some(hasRead);
  };

  return {
    full,
    canRead,
    // Read the collection's records. `names` are fields that only identify a row.
    require(collection) {
      if (canRead(collection)) return;
      const needs = sectionsOf(collection);
      throw new AccessDenied(denialMessage(needs === SUPER_ONLY ? [] : [].concat(needs)), needs === SUPER_ONLY ? [] : [].concat(needs));
    },
    // Name look-ups (find, or a join that only picks names) on a collection that is open for names.
    allowsNamesOnly(collection) {
      return !full && !canRead(collection) && LOOKUP_COLLECTIONS.has(collection);
    },
  };
}

/** Full access, for places that already know the caller is trusted. */
const fullAccess = () => accessFor({ admin_role: "Super Admin", permissions: ["ALL"] });

/**
 * Reads the Bearer token, checks it belongs to this school, and returns the admin's access.
 * Returns { error: { status, message } } when the caller may not use the assistant at all.
 */
async function resolveAccess(req, schoolId) {
  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ") || !process.env.JWT_SECRET) {
    return { error: { status: 401, message: "Please sign in again to use the assistant." } };
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (_) {
    return { error: { status: 401, message: "Your session has expired. Please sign in again." } };
  }
  if (String(payload.school_id || "") !== String(schoolId)) {
    return { error: { status: 403, message: "You cannot use the assistant for another school." } };
  }

  let admin = null;
  if (payload.user_type === "admin") {
    admin = await Admin.findOne({ admin_id: String(payload.reference_id), school_id: String(schoolId) }).lean();
  } else if (payload.user_type === "staff" || payload.user_type === "teacher") {
    admin = await Admin.findOne({ staff_id: String(payload.reference_id), school_id: String(schoolId), is_active: true }).lean();
  }
  if (!admin || admin.is_active === false) {
    return { error: { status: 403, message: "The assistant is for school admins." } };
  }
  return { access: accessFor(admin), admin };
}

module.exports = { AccessDenied, accessFor, fullAccess, resolveAccess, denialMessage, COLLECTION_SECTION, LOOKUP_COLLECTIONS };
