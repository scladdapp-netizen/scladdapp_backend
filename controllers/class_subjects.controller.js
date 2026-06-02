const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const StudentScore = require("../models/StudentScore.model");
const Subject = require("../models/Subject.model");
const Teacher = require("../models/Teacher.model");
const Staff = require("../models/Staff.model");
const Class = require("../models/Class.model");

const getSubjectsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "" } = req.query;
    if (!classId) return res.status(400).json({ success: false, message: "classId is required" });

    const classAssignments = await ClassSubjectAssignment.find({ class_id: classId, is_active: true }).lean();
    const subjectIds = classAssignments.map((a) => a.subject_id);

    const [subjects, teacherAssignments] = await Promise.all([
      Subject.find({ subject_id: { $in: subjectIds } }).lean(),
      TeacherSubjectAssignment.find({ subject_id: { $in: subjectIds }, is_active: true }).lean(),
    ]);

    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.subject_id] = s; });

    // Batch-fetch teachers and staff for enrichment
    const teacherIds = [...new Set(teacherAssignments.map((ta) => ta.teacher_id))];
    const [teachers, staffList] = await Promise.all([
      Teacher.find({ teacher_id: { $in: teacherIds } }).lean(),
      Staff.find({}).lean(),
    ]);
    const teacherMap = {};
    teachers.forEach((t) => { teacherMap[t.teacher_id] = t; });
    const staffMap = {};
    staffList.forEach((s) => { staffMap[s.staff_id] = s; });

    let rows = classAssignments.map((ca) => {
      const subject = subjectMap[ca.subject_id] || {};
      const ta = teacherAssignments.find((t) => t.subject_id === ca.subject_id);
      let teacherName = "—", teacherEmail = "—", teacherPhone = "—";
      if (ta) {
        const teacher = teacherMap[ta.teacher_id];
        const staffMember = teacher ? staffMap[teacher.staff_id] : null;
        teacherName  = staffMember?.full_name  || ta.teacher_name  || "—";
        teacherEmail = staffMember?.email      || ta.teacher_email || "—";
        teacherPhone = staffMember?.phone      || "—";
      }
      return {
        assignment_id:       ca.assignment_id,
        subject_id:          ca.subject_id,
        subject_name:        subject.subject_name        || "Unknown",
        subject_code:        subject.subject_code        || "—",
        subject_description: subject.subject_description || "—",
        is_active:           subject.is_active !== false,
        teacher_name:        teacherName,
        teacher_email:       teacherEmail,
        teacher_phone:       teacherPhone,
        assigned_date:       ca.start_date || null,
      };
    });

    if (search && search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        if (searchField && r[searchField] !== undefined) return r[searchField].toString().toLowerCase().includes(q);
        return r.subject_name.toLowerCase().includes(q) || r.subject_code.toLowerCase().includes(q) || r.teacher_name.toLowerCase().includes(q);
      });
    }

    const pageNum    = parseInt(page);
    const limitNum   = parseInt(limit);
    const total      = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex   = Math.min(startIndex + limitNum, total);

    return res.json({
      success: true,
      data: rows.slice(startIndex, endIndex),
      pagination: { currentPage: pageNum, totalPages, totalRecords: total, recordsPerPage: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1, startIndex: total === 0 ? 0 : startIndex + 1, endIndex },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSubjectsHistoryByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const inactive = await ClassSubjectAssignment.find({ class_id: classId, is_active: false }).lean();
    const subjectIds = inactive.map((a) => a.subject_id);
    const subjects = await Subject.find({ subject_id: { $in: subjectIds } }).lean();
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.subject_id] = s; });

    const rows = inactive
      .map((ca) => {
        const subject = subjectMap[ca.subject_id] || {};
        return {
          assignment_id:       ca.assignment_id,
          subject_id:          ca.subject_id,
          subject_name:        subject.subject_name        || "Unknown",
          subject_code:        subject.subject_code        || "—",
          subject_description: subject.subject_description || "—",
          start_date:          ca.start_date || null,
          end_date:            ca.end_date   || null,
          is_active:           false,
        };
      })
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deactivateClassSubject = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await ClassSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    assignment.is_active  = false;
    assignment.end_date   = new Date().toISOString().split("T")[0];
    assignment.updated_at = new Date();
    await assignment.save();

    // Also deactivate teacher-subject assignments for this subject+class
    await TeacherSubjectAssignment.updateMany(
      { subject_id: assignment.subject_id, class_id: assignment.class_id, is_active: true },
      { $set: { is_active: false, end_date: new Date().toISOString().split("T")[0], updated_at: new Date() } }
    );

    return res.json({ success: true, message: "Assignment deactivated" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const restoreClassSubject = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await ClassSubjectAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    assignment.is_active  = true;
    assignment.end_date   = null;
    assignment.updated_at = new Date();
    await assignment.save();

    // Also reactivate teacher-subject assignments for this subject+class
    await TeacherSubjectAssignment.updateMany(
      { subject_id: assignment.subject_id, class_id: assignment.class_id, is_active: false },
      { $set: { is_active: true, end_date: null, updated_at: new Date() } }
    );

    return res.json({ success: true, message: "Assignment restored" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteClassSubject = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await ClassSubjectAssignment.findOne({ assignment_id: assignmentId }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    // Block delete if scores exist for this subject+class
    const inUse = await StudentScore.exists({ subject_id: assignment.subject_id, class_id: assignment.class_id });
    if (inUse) {
      return res.status(400).json({ success: false, message: "This subject cannot be deleted because it has scores assigned to it in this class." });
    }

    await ClassSubjectAssignment.deleteOne({ assignment_id: assignmentId });
    await TeacherSubjectAssignment.deleteMany({ subject_id: assignment.subject_id, class_id: assignment.class_id });

    return res.json({ success: true, message: "Assignment deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getClassesBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const assignments = await ClassSubjectAssignment.find({ subject_id: subjectId })
      .sort({ created_at: -1 })
      .lean();
    return res.json({ success: true, data: assignments, count: assignments.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const assignSubjectToClass = async (req, res) => {
  try {
    const { subject_id, class_id, school_id } = req.body;
    if (!subject_id || !class_id || !school_id) {
      return res.status(400).json({ success: false, message: "subject_id, class_id and school_id are required" });
    }

    const existing = await ClassSubjectAssignment.findOne({ subject_id, class_id, is_active: true });
    if (existing) return res.status(400).json({ success: false, message: "Subject is already assigned to this class" });

    const cls = await Class.findOne({ class_id }).lean();

    const newAssignment = await ClassSubjectAssignment.create({
      assignment_id: Date.now().toString(),
      subject_id,
      class_id,
      class_name:  cls?.class_name || "",
      class_code:  cls?.class_code || "",
      school_id,
      start_date:  new Date().toISOString().split("T")[0],
      end_date:    null,
      is_active:   true,
      assigned_by: null,
      notes:       null,
    });

    return res.status(201).json({ success: true, data: newAssignment, message: "Subject assigned to class" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSubjectsByClass,
  getSubjectsHistoryByClass,
  getClassesBySubject,
  deactivateClassSubject,
  restoreClassSubject,
  deleteClassSubject,
  assignSubjectToClass,
};
