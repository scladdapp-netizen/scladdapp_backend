const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Student = require("../models/Student.model");
const Class = require("../models/Class.model");
const Session = require("../models/Session.model");

exports.createAssignment = async (assignmentData) => {
  try {
    const { student_id, school_id, class_id, session_id, session_name, subsession_id,
            subsession_name, assignment_method, assigned_by, assigned_date, remarks } = assignmentData;

    if (!student_id || !school_id || !class_id || !session_id || !assignment_method) {
      return { success: false, message: "Missing required fields: student_id, school_id, class_id, session_id, assignment_method" };
    }

    const validMethods = ["admission", "promotion", "demotion"];
    if (!validMethods.includes(assignment_method)) {
      return { success: false, message: `Invalid assignment method. Must be one of: ${validMethods.join(", ")}` };
    }

    const [student, classInfo] = await Promise.all([
      Student.findOne({ student_id }).lean(),
      Class.findOne({ class_id }).lean(),
    ]);

    if (!student)   return { success: false, message: "Student not found" };
    if (!classInfo) return { success: false, message: "Class not found" };

    const existing = await StudentClassAssignment.findOne({ student_id, session_id, is_active: true });
    if (existing) {
      return { success: false, message: "Student already has an active class assignment in this session", existing_assignment: existing };
    }

    const newAssignment = await StudentClassAssignment.create({
      assignment_id:   Date.now().toString(),
      student_id,
      school_id,
      class_id,
      class_name:      classInfo.class_name,
      stream:          classInfo.stream || null,
      session_id,
      session_name:    session_name || null,
      subsession_id:   subsession_id || null,
      subsession_name: subsession_name || null,
      assignment_method,
      assignment_date: assigned_date || new Date().toISOString().split("T")[0],
      is_active:       true,
      assigned_by:     assigned_by || null,
      remarks:         remarks || null,
    });

    return { success: true, message: "Student class assignment created successfully", data: newAssignment };
  } catch (error) {
    console.error("Create assignment error:", error);
    return { success: false, message: "Failed to create student class assignment", error: error.message };
  }
};

exports.createStudentClassAssignment = exports.createAssignment;

exports.getAssignmentsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) return res.status(400).json({ success: false, message: "Student ID is required" });
    const assignments = await StudentClassAssignment.find({ student_id: studentId }).lean();
    res.json({ success: true, data: assignments, count: assignments.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve student assignments", error: error.message });
  }
};

exports.getAssignmentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { sessionId } = req.query;
    if (!classId) return res.status(400).json({ success: false, message: "Class ID is required" });

    const query = { class_id: classId, is_active: true };
    if (sessionId) query.session_id = sessionId;

    const assignments = await StudentClassAssignment.find(query).lean();
    res.json({ success: true, data: assignments, count: assignments.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve class assignments", error: error.message });
  }
};

exports.getActiveAssignment = async (req, res) => {
  try {
    const { studentId, sessionId } = req.params;
    if (!studentId || !sessionId) return res.status(400).json({ success: false, message: "Student ID and Session ID are required" });

    const assignment = await StudentClassAssignment.findOne({ student_id: studentId, session_id: sessionId, is_active: true }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "No active assignment found for this student in this session" });

    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve active assignment", error: error.message });
  }
};

exports.deactivateAssignment = async (assignmentId) => {
  try {
    const assignment = await StudentClassAssignment.findOne({ assignment_id: assignmentId });
    if (!assignment) return { success: false, message: "Assignment not found" };
    assignment.is_active  = false;
    assignment.updated_at = new Date();
    await assignment.save();
    return { success: true, message: "Assignment deactivated successfully", data: assignment };
  } catch (error) {
    return { success: false, message: "Failed to deactivate assignment", error: error.message };
  }
};

exports.getAssignmentsBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "assignment_date",
            sortOrder = "desc", assignmentMethod = "" } = req.query;

    if (!sessionId) return res.status(400).json({ success: false, message: "Session ID is required" });

    const query = { session_id: sessionId, is_active: true };
    if (assignmentMethod && assignmentMethod.trim()) {
      query.assignment_method = { $in: assignmentMethod.split(",").map((m) => m.trim()) };
    }

    let assignments = await StudentClassAssignment.find(query).lean();

    // Enrich with student names
    const studentIds = assignments.map((a) => a.student_id);
    const students   = await Student.find({ student_id: { $in: studentIds } }).lean();
    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    let rows = assignments.map((a) => ({
      ...a,
      student_name: studentMap[a.student_id]?.full_name || "Unknown Student",
    }));

    // Search
    if (search && search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => {
        if (searchField) return String(a[searchField] || "").toLowerCase().includes(q);
        return (
          (a.student_name  || "").toLowerCase().includes(q) ||
          (a.student_id    || "").toLowerCase().includes(q) ||
          (a.class_name    || "").toLowerCase().includes(q) ||
          (a.assignment_method || "").toLowerCase().includes(q)
        );
      });
    }

    // Sort
    rows.sort((a, b) => {
      const aVal = String(a[sortBy] ?? "").toLowerCase();
      const bVal = String(b[sortBy] ?? "").toLowerCase();
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const pageNum    = parseInt(page);
    const limitNum   = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const paged      = rows.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: paged,
      pagination: {
        currentPage: pageNum,
        totalPages:  Math.ceil(rows.length / limitNum),
        totalItems:  rows.length,
        itemsPerPage: limitNum,
        hasNextPage: startIndex + limitNum < rows.length,
        hasPrevPage: pageNum > 1,
      },
      count: paged.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve session assignments", error: error.message });
  }
};

exports.getActiveCountsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const result = await StudentClassAssignment.aggregate([
      { $match: { school_id: schoolId, is_active: true } },
      { $group: { _id: "$class_id", count: { $sum: 1 } } },
    ]);
    const counts = {};
    result.forEach((r) => { counts[r._id] = r.count; });
    res.json({ success: true, data: counts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = exports;
