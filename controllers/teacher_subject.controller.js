const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const Teacher = require("../models/Teacher.model");
const Staff = require("../models/Staff.model");
const Class = require("../models/Class.model");
const Subject = require("../models/Subject.model");

const assignTeacherToSubject = async (assignmentData) => {
  try {
    if (!assignmentData.subject_id || !assignmentData.teacher_id) {
      return { success: false, error: "Missing required fields", message: "Subject ID and Teacher ID are required" };
    }

    // Block duplicate: same teacher already active for this subject+class
    const duplicate = await TeacherSubjectAssignment.findOne({
      subject_id: assignmentData.subject_id,
      teacher_id: assignmentData.teacher_id,
      class_id:   assignmentData.class_id,
      is_active:  true,
    });
    if (duplicate) return { success: false, error: "Duplicate assignment", message: "This teacher already has an active assignment for this subject in this class." };

    // Block if another teacher already active for this subject+class
    const classAlreadyTaken = await TeacherSubjectAssignment.findOne({
      subject_id: assignmentData.subject_id,
      class_id:   assignmentData.class_id,
      teacher_id: { $ne: assignmentData.teacher_id },
      is_active:  true,
    });
    if (classAlreadyTaken) {
      return { success: false, error: "Class already assigned", message: `This class already has an active teacher (${classAlreadyTaken.teacher_name}). Deactivate the current assignment first.` };
    }

    const teacher = await Teacher.findOne({ teacher_id: assignmentData.teacher_id }).lean();
    if (!teacher) return { success: false, error: "Teacher not found", message: "Teacher record not found" };

    const teacherStaff = await Staff.findOne({ staff_id: teacher.staff_id }).lean();
    if (!teacherStaff) return { success: false, error: "Staff not found", message: "Teacher staff record not found" };

    let resolvedClassId   = assignmentData.class_id || null;
    let resolvedClassName = null;
    if (resolvedClassId) {
      const cls = await Class.findOne({ class_id: resolvedClassId }).lean();
      resolvedClassName = cls?.class_name || null;
    }

    const newAssignment = await TeacherSubjectAssignment.create({
      assignment_id: Date.now().toString(),
      subject_id:    assignmentData.subject_id,
      teacher_id:    assignmentData.teacher_id,
      teacher_name:  teacherStaff.full_name,
      teacher_email: teacherStaff.email,
      school_id:     assignmentData.school_id,
      class_id:      resolvedClassId,
      class_name:    resolvedClassName,
      session_id:    assignmentData.session_id || null,
      session_name:  assignmentData.session_name || null,
      session_code:  assignmentData.session_code || null,
      start_date:    assignmentData.start_date || new Date().toISOString().split("T")[0],
      end_date:      assignmentData.end_date || null,
      is_active:     true,
      assigned_by:   assignmentData.assigned_by || null,
      notes:         assignmentData.notes || null,
    });

    return { success: true, data: newAssignment, message: "Teacher assigned to subject successfully" };
  } catch (error) {
    console.error("Assign teacher to subject error:", error);
    return { success: false, error: "Assignment failed", message: error.message || "Failed to assign teacher to subject" };
  }
};

const getTeacherSubjectAssignments = async (subjectId) => {
  try {
    const assignments = await TeacherSubjectAssignment.find({ subject_id: subjectId }).sort({ start_date: -1 }).lean();
    return { success: true, data: assignments, message: "Assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get assignments failed", message: error.message || "Failed to retrieve assignments" };
  }
};

const updateTeacherSubjectAssignment = async (assignmentId, assignmentData) => {
  try {
    const assignment = await TeacherSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Assignment not found" };

    // If reactivating, check class-subject is still active and no other teacher is active
    if (assignmentData.is_active === true && !assignment.is_active) {
      const classIsActive = await ClassSubjectAssignment.exists({ subject_id: assignment.subject_id, class_id: assignment.class_id, is_active: true });
      if (!classIsActive) {
        return { success: false, error: "Class not active", message: `Cannot reactivate: the class "${assignment.class_name || assignment.class_id}" is not active for this subject. Reactivate the class first.` };
      }
      const classAlreadyTaken = await TeacherSubjectAssignment.findOne({ subject_id: assignment.subject_id, class_id: assignment.class_id, assignment_id: { $ne: assignmentId }, is_active: true });
      if (classAlreadyTaken) {
        return { success: false, error: "Class already assigned", message: `Cannot reactivate: this class already has an active teacher (${classAlreadyTaken.teacher_name}). Deactivate that assignment first.` };
      }
    }

    if (assignmentData.start_date !== undefined) assignment.start_date = assignmentData.start_date;
    if (assignmentData.end_date   !== undefined) assignment.end_date   = assignmentData.end_date;
    if (assignmentData.is_active  !== undefined) assignment.is_active  = assignmentData.is_active;
    if (assignmentData.notes      !== undefined) assignment.notes      = assignmentData.notes;
    assignment.updated_at = new Date();
    await assignment.save();

    return { success: true, data: assignment, message: "Assignment updated successfully" };
  } catch (error) {
    return { success: false, error: "Update assignment failed", message: error.message || "Failed to update assignment" };
  }
};

const getActiveTeacherSubjectAssignmentsBySchool = async (schoolId) => {
  try {
    const assignments = await TeacherSubjectAssignment.find({ school_id: schoolId, is_active: true }).lean();
    return { success: true, data: assignments, message: "Active assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get assignments failed", message: error.message || "Failed to retrieve active assignments" };
  }
};

const deactivateTeacherSubjectAssignment = async (assignmentId) => {
  try {
    const assignment = await TeacherSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Assignment not found" };

    assignment.is_active  = false;
    assignment.end_date   = new Date().toISOString().split("T")[0];
    assignment.updated_at = new Date();
    await assignment.save();

    return { success: true, message: "Assignment deactivated successfully" };
  } catch (error) {
    return { success: false, error: "Deactivate assignment failed", message: error.message || "Failed to deactivate assignment" };
  }
};

const getAssignmentsByTeacher = async (teacherId, showHistory = false) => {
  try {
    const assignments = await TeacherSubjectAssignment.find({ teacher_id: teacherId, is_active: !showHistory }).lean();

    const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
    const subjects   = await Subject.find({ subject_id: { $in: subjectIds } }).lean();
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.subject_id] = s; });

    const classIds = [...new Set(assignments.map((a) => a.class_id).filter(Boolean))];
    const classAssignments = await ClassSubjectAssignment.find({ subject_id: { $in: subjectIds }, class_id: { $in: classIds }, is_active: true }).lean();
    const classAssignMap = {};
    classAssignments.forEach((c) => { classAssignMap[`${c.subject_id}_${c.class_id}`] = c; });

    const enriched = assignments.map((a) => {
      const subject = subjectMap[a.subject_id] || {};
      const ca      = classAssignMap[`${a.subject_id}_${a.class_id}`] || {};
      return {
        assignment_id: a.assignment_id,
        subject_id:    a.subject_id,
        subject_name:  subject.subject_name || "Unknown",
        subject_code:  subject.subject_code || "-",
        class_id:      a.class_id || ca.class_id || null,
        class_name:    a.class_name || ca.class_name || "Not assigned to class",
        class_code:    ca.class_code || "-",
        start_date:    a.start_date,
        end_date:      a.end_date || null,
        is_active:     a.is_active,
        notes:         a.notes,
      };
    });

    return { success: true, data: enriched };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const deleteTeacherSubjectAssignment = async (assignmentId) => {
  try {
    const assignment = await TeacherSubjectAssignment.findOneAndDelete({ assignment_id: assignmentId });
    if (!assignment) return { success: false, message: "Assignment not found" };
    return { success: true, message: "Assignment deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

module.exports = {
  assignTeacherToSubject,
  getTeacherSubjectAssignments,
  getActiveTeacherSubjectAssignmentsBySchool,
  updateTeacherSubjectAssignment,
  deactivateTeacherSubjectAssignment,
  getAssignmentsByTeacher,
  deleteTeacherSubjectAssignment,
};
