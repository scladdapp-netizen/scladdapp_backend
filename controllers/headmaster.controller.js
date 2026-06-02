const ClassHeadmaster = require("../models/ClassHeadmaster.model");
const Teacher = require("../models/Teacher.model");
const Staff = require("../models/Staff.model");
const Class = require("../models/Class.model");

const assignHeadmaster = async (assignmentData) => {
  try {
    if (!assignmentData.class_id || !assignmentData.teacher_id || !assignmentData.school_id) {
      return { success: false, error: "Missing required fields", message: "Class ID, Teacher ID, and School ID are required" };
    }

    const teacher = await Teacher.findOne({ teacher_id: assignmentData.teacher_id }).lean();
    if (!teacher) return { success: false, error: "Teacher not found", message: "The specified teacher does not exist" };

    const staffMember = await Staff.findOne({ staff_id: teacher.staff_id }).lean();
    if (!staffMember) return { success: false, error: "Staff not found", message: "The staff member associated with this teacher does not exist" };

    // Deactivate any existing active assignments for this class
    await ClassHeadmaster.updateMany(
      { class_id: assignmentData.class_id, is_active: true },
      { $set: { is_active: false, end_date: new Date().toISOString().split("T")[0], updated_at: new Date() } }
    );

    const newAssignment = await ClassHeadmaster.create({
      assignment_id:  Date.now().toString(),
      class_id:       assignmentData.class_id,
      teacher_id:     assignmentData.teacher_id,
      teacher_name:   staffMember.full_name,
      teacher_email:  staffMember.email,
      school_id:      assignmentData.school_id,
      session_id:     assignmentData.session_id || null,
      session_name:   assignmentData.session_name || null,
      session_code:   assignmentData.session_code || null,
      start_date:     assignmentData.start_date || new Date().toISOString().split("T")[0],
      end_date:       assignmentData.end_date || null,
      is_active:      true,
      assigned_by:    assignmentData.assigned_by || null,
      notes:          assignmentData.notes || null,
    });

    console.log("Headmaster assigned with ID:", newAssignment.assignment_id);
    return { success: true, data: newAssignment, message: "Headmaster assigned successfully" };
  } catch (error) {
    console.error("Assign headmaster error:", error);
    return { success: false, error: "Assign headmaster failed", message: error.message || "Failed to assign headmaster" };
  }
};

const getActiveHeadmasterByClassId = async (classId) => {
  try {
    const assignment = await ClassHeadmaster.findOne({ class_id: classId, is_active: true }).lean();
    return { success: true, data: assignment || null, message: assignment ? "Active headmaster retrieved successfully" : "No active headmaster found for this class" };
  } catch (error) {
    return { success: false, error: "Get headmaster failed", message: error.message || "Failed to retrieve headmaster" };
  }
};

const getHeadmastersByClassId = async (classId) => {
  try {
    const assignments = await ClassHeadmaster.find({ class_id: classId }).sort({ start_date: -1 }).lean();

    const teacherIds = [...new Set(assignments.map((a) => a.teacher_id))];
    const teachers = await Teacher.find({ teacher_id: { $in: teacherIds } }).lean();
    const teacherMap = {};
    teachers.forEach((t) => { teacherMap[t.teacher_id] = t; });

    const staffIds = teachers.map((t) => t.staff_id);
    const staffList = await Staff.find({ staff_id: { $in: staffIds } }).lean();
    const staffMap = {};
    staffList.forEach((s) => { staffMap[s.staff_id] = s; });

    const enriched = assignments.map((a) => {
      const teacher = teacherMap[a.teacher_id];
      const s = teacher ? staffMap[teacher.staff_id] : null;
      return {
        ...a,
        teacher_phone:           s?.phone || null,
        teacher_position:        s?.position || null,
        teacher_job_title:       s?.job_title || null,
        teacher_department:      s?.department || null,
        teacher_gender:          s?.gender || null,
        teacher_employment_type: s?.employment_type || null,
        teacher_joining_date:    s?.joining_date || null,
      };
    });

    return { success: true, data: enriched, message: "Headmaster assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get headmasters failed", message: error.message || "Failed to retrieve headmasters" };
  }
};

const getActiveHeadmastersBySchoolId = async (schoolId) => {
  try {
    const assignments = await ClassHeadmaster.find({ school_id: schoolId, is_active: true }).lean();
    return { success: true, data: assignments, message: "Active headmasters retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get headmasters failed", message: error.message || "Failed to retrieve active headmasters" };
  }
};

const removeHeadmaster = async (assignmentId) => {
  try {
    const assignment = await ClassHeadmaster.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Headmaster assignment not found" };

    assignment.is_active  = false;
    assignment.end_date   = new Date().toISOString().split("T")[0];
    assignment.updated_at = new Date();
    await assignment.save();

    return { success: true, message: "Headmaster removed successfully" };
  } catch (error) {
    return { success: false, error: "Remove headmaster failed", message: error.message || "Failed to remove headmaster" };
  }
};

const getHeadmastersByTeacherId = async (teacherId) => {
  try {
    const assignments = await ClassHeadmaster.find({ teacher_id: teacherId }).sort({ start_date: -1 }).lean();

    const classIds = [...new Set(assignments.map((a) => a.class_id))];
    const classes = await Class.find({ class_id: { $in: classIds } }).lean();
    const classMap = {};
    classes.forEach((c) => { classMap[c.class_id] = c; });

    const enriched = assignments.map((a) => {
      const cls = classMap[a.class_id];
      return {
        ...a,
        class_name: cls ? `${cls.class_name} ${cls.class_section || ""}`.trim() : a.class_id,
        class_code: cls?.class_code || null,
      };
    });

    return { success: true, data: enriched, message: "Headmaster assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get headmasters failed", message: error.message || "Failed to retrieve headmaster assignments" };
  }
};

module.exports = { assignHeadmaster, getActiveHeadmasterByClassId, getHeadmastersByClassId, getActiveHeadmastersBySchoolId, getHeadmastersByTeacherId, removeHeadmaster };
