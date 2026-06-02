const Teacher = require("../models/Teacher.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");
const TeacherAssignmentHistory = require("../models/TeacherAssignmentHistory.model");

const enrichTeacher = async (teacher) => {
  const staffMember = await Staff.findOne({ staff_id: teacher.staff_id }).lean();
  let appointedByAdmin = null;
  if (teacher.appointed_by) {
    const admin = await Admin.findOne({ admin_id: teacher.appointed_by }).lean();
    if (admin) appointedByAdmin = { admin_id: admin.admin_id, full_name: admin.username || admin.full_name, email: admin.email, admin_role: admin.admin_role || "Admin" };
  }
  return { ...teacher, staff: staffMember || null, appointed_by_admin: appointedByAdmin };
};

const createTeacher = async (teacherData) => {
  try {
    if (!teacherData.staff_id || !teacherData.teacher_code || !teacherData.school_id) {
      return { success: false, error: "Missing required fields", message: "Staff ID, teacher code, and school ID are required" };
    }

    const staffMember = await Staff.findOne({ staff_id: teacherData.staff_id, school_id: teacherData.school_id, is_active: true });
    if (!staffMember) return { success: false, error: "Staff not found", message: "Staff member not found or not active in the specified school" };

    const codeExists = await Teacher.findOne({ teacher_code: teacherData.teacher_code, school_id: teacherData.school_id, is_active: true });
    if (codeExists) return { success: false, error: "Teacher code already exists", message: "A teacher with this code already exists in this school" };

    const newTeacher = await Teacher.create({
      teacher_id:   Date.now().toString(),
      staff_id:     teacherData.staff_id,
      school_id:    teacherData.school_id,
      teacher_code: teacherData.teacher_code,
      is_active:    true,
      appointed_by: teacherData.appointed_by || null,
      appointed_at: new Date(),
      revoked_at:   null,
    });

    // Update staff role to Teacher
    await Staff.updateOne({ staff_id: teacherData.staff_id }, { $set: { role: "Teacher", updated_at: new Date() } });

    return { success: true, data: { teacher_id: newTeacher.teacher_id, teacher: newTeacher, staff: staffMember, message: "Teacher created successfully" }, message: "Teacher created successfully" };
  } catch (error) {
    console.error("Create teacher error:", error);
    return { success: false, error: "Create teacher failed", message: error.message || "Failed to create teacher" };
  }
};

const getTeacherById = async (teacherId) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId }).lean();
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };
    return { success: true, data: await enrichTeacher(teacher), message: "Teacher retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get teacher failed", message: error.message || "Failed to retrieve teacher" };
  }
};

const getTeacherDetail = async (teacherId) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId }).lean();
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    const enriched = await enrichTeacher(teacher);

    const teacherCreatedDate = new Date(teacher.created_at);
    teacherCreatedDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr   = today.toISOString().split("T")[0];
    const createdStr = teacherCreatedDate.toISOString().split("T")[0];

    const allSessions = await Session.find({
      school_id:                teacher.school_id,
      is_archived:              { $ne: true },
      session_status:           { $ne: "archived" },
      academic_year_start_date: { $lte: todayStr },
      academic_year_end_date:   { $gte: createdStr },
    }).lean();

    const validSessions = [];
    for (const session of allSessions) {
      const subsessions = await Subsession.find({ session_id: session.session_id, term_end_date: { $gte: createdStr } }).lean();
      if (!subsessions.length) continue;
      validSessions.push({
        session_id:   session.session_id,
        session_name: session.session_name,
        subsessions:  subsessions.map((s) => ({ subsession_id: s.term_id, subsession_name: s.term_name })),
      });
    }

    return { success: true, data: { teacher: enriched, sessions: validSessions }, message: "Teacher detail retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get teacher detail failed", message: error.message || "Failed to retrieve teacher detail" };
  }
};

const getTeacherByStaffId = async (staffId, schoolId) => {
  try {
    const teacher = await Teacher.findOne({ staff_id: staffId, school_id: schoolId, is_active: true }).lean();
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found for this staff member" };
    return { success: true, data: await enrichTeacher(teacher), message: "Teacher retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get teacher failed", message: error.message || "Failed to retrieve teacher" };
  }
};

const getTeachersBySchoolId = async (schoolId) => {
  try {
    const teachers = await Teacher.find({ school_id: schoolId, is_active: true }).lean();
    const staffIds = teachers.map((t) => t.staff_id);
    const appointedByIds = teachers.map((t) => t.appointed_by).filter(Boolean);

    const [staffList, adminList] = await Promise.all([
      Staff.find({ staff_id: { $in: staffIds } }).lean(),
      Admin.find({ admin_id: { $in: appointedByIds } }).lean(),
    ]);
    const staffMap = {};
    staffList.forEach((s) => { staffMap[s.staff_id] = s; });
    const adminMap = {};
    adminList.forEach((a) => { adminMap[a.admin_id] = a; });

    const enriched = teachers.map((t) => {
      const a = t.appointed_by ? adminMap[t.appointed_by] : null;
      return {
        ...t,
        staff: staffMap[t.staff_id] || null,
        appointed_by_admin: a ? { admin_id: a.admin_id, full_name: a.username || a.full_name, email: a.email, admin_role: a.admin_role || "Admin" } : null,
      };
    });

    return { success: true, data: enriched, message: "Teachers retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get school teachers failed", message: error.message || "Failed to retrieve teachers" };
  }
};

const updateTeacher = async (teacherId, teacherData) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId });
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    if (teacherData.teacher_code && teacherData.teacher_code !== teacher.teacher_code) {
      const codeExists = await Teacher.findOne({ teacher_code: teacherData.teacher_code, school_id: teacher.school_id, teacher_id: { $ne: teacherId }, is_active: true });
      if (codeExists) return { success: false, error: "Teacher code already exists", message: "Another teacher with this code already exists in this school" };
    }

    if (teacherData.teacher_code) teacher.teacher_code = teacherData.teacher_code;
    teacher.updated_at = new Date();
    await teacher.save();

    const staffMember = await Staff.findOne({ staff_id: teacher.staff_id }).lean();
    return { success: true, data: { teacher_id: teacherId, teacher, staff: staffMember || null, message: "Teacher updated successfully" }, message: "Teacher updated successfully" };
  } catch (error) {
    return { success: false, error: "Update teacher failed", message: error.message || "Failed to update teacher" };
  }
};

const revokeTeacher = async (teacherId, revokedBy) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId });
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    teacher.is_active  = false;
    teacher.revoked_at = new Date();
    teacher.updated_at = new Date();
    await teacher.save();

    const staffMember = await Staff.findOne({ staff_id: teacher.staff_id });
    if (staffMember) {
      staffMember.role       = staffMember.position || "Support Staff";
      staffMember.updated_at = new Date();
      await staffMember.save();
    }

    return { success: true, message: "Teacher role revoked successfully" };
  } catch (error) {
    return { success: false, error: "Revoke teacher failed", message: error.message || "Failed to revoke teacher" };
  }
};

const reactivateTeacher = async (teacherId, reactivatedBy) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId });
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    teacher.is_active  = true;
    teacher.updated_at = new Date();
    await teacher.save();

    await Staff.updateOne({ staff_id: teacher.staff_id }, { $set: { role: "Teacher", updated_at: new Date() } });

    return { success: true, message: "Teacher reactivated successfully" };
  } catch (error) {
    return { success: false, error: "Reactivate teacher failed", message: error.message || "Failed to reactivate teacher" };
  }
};

const deleteTeacher = async (teacherId) => {
  try {
    const teacher = await Teacher.findOneAndDelete({ teacher_id: teacherId });
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    const staffMember = await Staff.findOne({ staff_id: teacher.staff_id });
    if (staffMember) {
      staffMember.role       = staffMember.position || "Support Staff";
      staffMember.updated_at = new Date();
      await staffMember.save();
    }

    return { success: true, message: "Teacher deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete teacher failed", message: error.message || "Failed to delete teacher" };
  }
};

const changeTeacherAssignment = async (teacherId, newStaffId, changedBy) => {
  try {
    const teacher = await Teacher.findOne({ teacher_id: teacherId });
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher not found" };

    const oldStaffId = teacher.staff_id;
    const newStaffMember = await Staff.findOne({ staff_id: newStaffId, school_id: teacher.school_id, is_active: true });
    if (!newStaffMember) return { success: false, error: "Staff not found", message: "New staff member not found or not active in the specified school" };

    const oldStaffMember = await Staff.findOne({ staff_id: oldStaffId }).lean();

    const historyRecord = await TeacherAssignmentHistory.create({
      history_id:      Date.now().toString(),
      teacher_id:      teacherId,
      teacher_code:    teacher.teacher_code,
      school_id:       teacher.school_id,
      old_staff_id:    oldStaffId,
      old_staff_name:  oldStaffMember?.full_name || "Unknown",
      old_staff_email: oldStaffMember?.email || null,
      new_staff_id:    newStaffId,
      new_staff_name:  newStaffMember.full_name,
      new_staff_email: newStaffMember.email,
      changed_by:      changedBy || null,
      changed_at:      new Date(),
      reason:          "Staff reassignment",
    });

    // Update old staff role back
    await Staff.updateOne({ staff_id: oldStaffId }, { $set: { role: oldStaffMember?.position || "Support Staff", updated_at: new Date() } });
    // Update new staff role to Teacher
    await Staff.updateOne({ staff_id: newStaffId }, { $set: { role: "Teacher", updated_at: new Date() } });

    teacher.staff_id   = newStaffId;
    teacher.updated_at = new Date();
    await teacher.save();

    return { success: true, data: { teacher_id: teacherId, old_staff: oldStaffMember, new_staff: newStaffMember, history_record: historyRecord }, message: "Teacher assignment changed successfully" };
  } catch (error) {
    return { success: false, error: "Change assignment failed", message: error.message || "Failed to change teacher assignment" };
  }
};

const getTeacherAssignmentHistory = async (teacherId) => {
  try {
    const history = await TeacherAssignmentHistory.find({ teacher_id: teacherId }).sort({ changed_at: -1 }).lean();
    return { success: true, data: history, message: "Teacher assignment history retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get history failed", message: error.message || "Failed to retrieve assignment history" };
  }
};

module.exports = { createTeacher, getTeacherById, getTeacherDetail, getTeacherByStaffId, getTeachersBySchoolId, updateTeacher, revokeTeacher, reactivateTeacher, deleteTeacher, changeTeacherAssignment, getTeacherAssignmentHistory };
