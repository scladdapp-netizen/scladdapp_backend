const Subject = require("../models/Subject.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");

const createSubject = async (subjectData) => {
  try {
    if (!subjectData.subjectName || !subjectData.subjectCode) {
      return { success: false, error: "Missing required fields", message: "Subject name and code are required" };
    }
    if (!subjectData.school_id) {
      return { success: false, error: "Missing school ID", message: "School ID is required" };
    }

    const duplicate = await Subject.findOne({ subject_code: subjectData.subjectCode, school_id: subjectData.school_id });
    if (duplicate) return { success: false, error: "Duplicate subject code", message: "A subject with this code already exists in this school" };

    const newSubject = await Subject.create({
      subject_id:          Date.now().toString(),
      subject_name:        subjectData.subjectName,
      subject_code:        subjectData.subjectCode,
      subject_description: subjectData.subjectDescription || null,
      stream:              subjectData.stream || null,
      school_id:           subjectData.school_id,
      is_active:           true,
      created_by:          subjectData.created_by || null,
    });

    return { success: true, data: newSubject, message: "Subject created successfully" };
  } catch (error) {
    console.error("Create subject error:", error);
    return { success: false, error: "Create subject failed", message: error.message || "Failed to create subject" };
  }
};

const getSubjectDetail = async (subjectId) => {
  try {
    const subject = await Subject.findOne({ subject_id: subjectId }).lean();
    if (!subject) return { success: false, error: "Subject not found", message: "Subject not found" };

    const [teacherAssignments, classAssignments] = await Promise.all([
      TeacherSubjectAssignment.find({ subject_id: subjectId }).sort({ start_date: -1 }).lean(),
      ClassSubjectAssignment.find({ subject_id: subjectId }).sort({ start_date: -1 }).lean(),
    ]);

    const subjectCreatedDate = new Date(subject.created_at);
    subjectCreatedDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const createdStr = subjectCreatedDate.toISOString().split("T")[0];

    const allSessions = await Session.find({
      school_id:                subject.school_id,
      is_archived:              { $ne: true },
      session_status:           { $ne: "archived" },
      academic_year_start_date: { $lte: todayStr },
      academic_year_end_date:   { $gte: createdStr },
    }).lean();

    const validSessions = [];
    for (const session of allSessions) {
      const subsessions = await Subsession.find({
        session_id:    session.session_id,
        term_end_date: { $gte: createdStr },
      }).lean();
      if (!subsessions.length) continue;
      validSessions.push({
        session_id:         session.session_id,
        session_name:       session.session_name,
        session_start_date: session.academic_year_start_date,
        session_end_date:   session.academic_year_end_date,
        subsessions: subsessions.map((s) => ({ subsession_id: s.term_id, subsession_name: s.term_name })),
      });
    }

    return { success: true, data: { subject, teacher_assignments: teacherAssignments, class_assignments: classAssignments, sessions: validSessions }, message: "Subject detail retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subject detail failed", message: error.message || "Failed to retrieve subject detail" };
  }
};

const getSubjectById = async (subjectId) => {
  try {
    const subject = await Subject.findOne({ subject_id: subjectId }).lean();
    if (!subject) return { success: false, error: "Subject not found", message: "Subject not found" };
    return { success: true, data: subject, message: "Subject retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subject failed", message: error.message || "Failed to retrieve subject" };
  }
};

const getSubjectsBySchoolId = async (schoolId) => {
  try {
    const subjects = await Subject.find({ school_id: schoolId }).lean();
    return { success: true, data: subjects, message: "Subjects retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subjects failed", message: error.message || "Failed to retrieve subjects" };
  }
};

const updateSubject = async (subjectId, subjectData) => {
  try {
    const subject = await Subject.findOne({ subject_id: subjectId });
    if (!subject) return { success: false, error: "Subject not found", message: "Subject not found" };

    if (subjectData.subjectCode && subjectData.subjectCode !== subject.subject_code) {
      const dup = await Subject.findOne({ subject_code: subjectData.subjectCode, school_id: subject.school_id, subject_id: { $ne: subjectId } });
      if (dup) return { success: false, error: "Subject code already exists", message: "Another subject with this code already exists in this school" };
    }

    if (subjectData.subjectName        !== undefined) subject.subject_name        = subjectData.subjectName;
    if (subjectData.subjectCode        !== undefined) subject.subject_code        = subjectData.subjectCode;
    if (subjectData.subjectDescription !== undefined) subject.subject_description = subjectData.subjectDescription;
    if (subjectData.stream             !== undefined) subject.stream              = subjectData.stream;
    if (subjectData.is_active          !== undefined) subject.is_active           = subjectData.is_active;
    subject.updated_at = new Date();
    await subject.save();

    return { success: true, data: subject, message: "Subject updated successfully" };
  } catch (error) {
    return { success: false, error: "Update subject failed", message: error.message || "Failed to update subject" };
  }
};

const deleteSubject = async (subjectId) => {
  try {
    const subject = await Subject.findOne({ subject_id: subjectId });
    if (!subject) return { success: false, error: "Subject not found", message: "Subject not found" };
    subject.is_active  = false;
    subject.updated_at = new Date();
    await subject.save();
    return { success: true, message: "Subject deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete subject failed", message: error.message || "Failed to delete subject" };
  }
};

const hardDeleteSubject = async (subjectId) => {
  try {
    const subject = await Subject.findOneAndDelete({ subject_id: subjectId });
    if (!subject) return { success: false, error: "Subject not found", message: "Subject not found" };
    return { success: true, message: "Subject permanently deleted" };
  } catch (error) {
    return { success: false, error: "Hard delete subject failed", message: error.message || "Failed to permanently delete subject" };
  }
};

module.exports = { createSubject, getSubjectDetail, getSubjectById, getSubjectsBySchoolId, updateSubject, deleteSubject, hardDeleteSubject };
