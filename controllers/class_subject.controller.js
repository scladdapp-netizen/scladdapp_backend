const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const Class = require("../models/Class.model");
const Subject = require("../models/Subject.model");

const assignClassToSubject = async (assignmentData) => {
  try {
    if (!assignmentData.subject_id || !assignmentData.class_id || !assignmentData.school_id) {
      return { success: false, error: "Missing required fields", message: "Subject ID, Class ID, and School ID are required" };
    }

    const existing = await ClassSubjectAssignment.findOne({
      subject_id: assignmentData.subject_id,
      class_id:   assignmentData.class_id,
      is_active:  true,
    });
    if (existing) return { success: false, error: "Active assignment exists", message: "This subject is already assigned to this class." };

    const classInfo = await Class.findOne({ class_id: assignmentData.class_id }).lean();
    if (!classInfo) return { success: false, error: "Class not found", message: "The specified class does not exist" };

    const newAssignment = await ClassSubjectAssignment.create({
      assignment_id: Date.now().toString(),
      subject_id:    assignmentData.subject_id,
      class_id:      assignmentData.class_id,
      class_name:    classInfo.class_name,
      class_code:    classInfo.class_code,
      school_id:     assignmentData.school_id,
      start_date:    assignmentData.start_date || new Date().toISOString().split("T")[0],
      end_date:      assignmentData.end_date || null,
      is_active:     true,
      assigned_by:   assignmentData.assigned_by || null,
      notes:         assignmentData.notes || null,
    });

    return { success: true, data: newAssignment, message: "Class assigned to subject successfully" };
  } catch (error) {
    console.error("Assign class to subject error:", error);
    return { success: false, error: "Assignment failed", message: error.message || "Failed to assign class to subject" };
  }
};

const getClassAssignmentsBySubject = async (subjectId) => {
  try {
    const assignments = await ClassSubjectAssignment.find({ subject_id: subjectId })
      .sort({ start_date: -1 })
      .lean();
    return { success: true, data: assignments, message: "Class assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get assignments failed", message: error.message || "Failed to retrieve class assignments" };
  }
};

const getActiveClassAssignment = async (subjectId) => {
  try {
    const assignment = await ClassSubjectAssignment.findOne({ subject_id: subjectId, is_active: true, end_date: null }).lean();
    if (!assignment) return { success: false, error: "No active assignment", message: "No active class assignment found for this subject" };
    return { success: true, data: assignment, message: "Active class assignment retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get assignment failed", message: error.message || "Failed to retrieve active class assignment" };
  }
};

const endClassAssignment = async (assignmentId, endDate) => {
  try {
    const assignment = await ClassSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Class assignment not found" };

    assignment.end_date   = endDate || new Date().toISOString().split("T")[0];
    assignment.is_active  = false;
    assignment.updated_at = new Date();
    await assignment.save();

    return { success: true, data: assignment, message: "Class assignment ended successfully" };
  } catch (error) {
    return { success: false, error: "End assignment failed", message: error.message || "Failed to end class assignment" };
  }
};

const updateClassAssignment = async (assignmentId, updateData) => {
  try {
    const assignment = await ClassSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Class assignment not found" };

    Object.assign(assignment, updateData);
    assignment.updated_at = new Date();
    await assignment.save();

    return { success: true, data: assignment, message: "Class assignment updated successfully" };
  } catch (error) {
    return { success: false, error: "Update assignment failed", message: error.message || "Failed to update class assignment" };
  }
};

const deleteClassAssignment = async (assignmentId) => {
  try {
    const assignment = await ClassSubjectAssignment.findOneAndDelete({ assignment_id: assignmentId });
    if (!assignment) return { success: false, error: "Assignment not found", message: "Class assignment not found" };
    return { success: true, message: "Class assignment deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete assignment failed", message: error.message || "Failed to delete class assignment" };
  }
};

const getActiveClassSubjectAssignmentsBySchool = async (schoolId) => {
  try {
    const assignments = await ClassSubjectAssignment.find({ school_id: schoolId, is_active: true }).lean();

    const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
    const subjects   = await Subject.find({ subject_id: { $in: subjectIds } }).lean();
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.subject_id] = s.subject_name; });

    const enriched = assignments.map((a) => ({ ...a, subject_name: subjectMap[a.subject_id] || null }));
    return { success: true, data: enriched, message: "Active class-subject assignments retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get assignments failed", message: error.message || "Failed to retrieve active assignments" };
  }
};

module.exports = {
  assignClassToSubject,
  getClassAssignmentsBySubject,
  getActiveClassAssignment,
  getActiveClassSubjectAssignmentsBySchool,
  endClassAssignment,
  updateClassAssignment,
  deleteClassAssignment,
};
