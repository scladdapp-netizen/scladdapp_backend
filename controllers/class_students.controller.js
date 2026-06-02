const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Subsession = require("../models/Subsession.model");
const Student = require("../models/Student.model");
const StudentGuardian = require("../models/StudentGuardian.model");

/**
 * GET /api/class-students/:classId/subsession/:subsessionId
 * Returns all active students assigned to a class for the session
 * that owns the given subsession. Supports pagination + search.
 */
const getStudentsByClassAndSubsession = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "" } = req.query;

    if (!classId || !subsessionId) {
      return res.status(400).json({ success: false, message: "classId and subsessionId are required" });
    }

    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return res.status(404).json({ success: false, message: "Subsession not found" });

    const assignments = await StudentClassAssignment.find({
      class_id:   classId,
      session_id: subsession.session_id,
      is_active:  true,
    }).lean();

    const studentIds = assignments.map((a) => a.student_id);

    const [students, guardians] = await Promise.all([
      Student.find({ student_id: { $in: studentIds } }).lean(),
      StudentGuardian.find({ student_id: { $in: studentIds } }).lean(),
    ]);

    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    // Build primary guardian map
    const guardianMap = {};
    guardians.forEach((g) => {
      if (!guardianMap[g.student_id] || g.is_primary) {
        guardianMap[g.student_id] = g;
      }
    });

    let rows = assignments.map((a) => {
      const s = studentMap[a.student_id] || {};
      const g = guardianMap[a.student_id] || {};
      return {
        assignment_id:     a.assignment_id,
        student_id:        a.student_id,
        full_name:         s.full_name         || "Unknown",
        admission_number:  s.admission_number  || "—",
        gender:            s.gender            || "—",
        date_of_birth:     s.date_of_birth     || null,
        phone:             s.phone             || "—",
        address:           s.address           || "—",
        student_status:    s.student_status    || "active",
        student_photo:     s.student_photo     || null,
        assignment_method: a.assignment_method || "—",
        assignment_date:   a.assignment_date   || null,
        guardian_name:     g.guardian_name     || "—",
        guardian_phone:    g.guardian_phone    || "—",
      };
    });

    // Search
    if (search && search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        if (searchField && r[searchField] !== undefined) return r[searchField].toString().toLowerCase().includes(q);
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.admission_number.toLowerCase().includes(q) ||
          r.gender.toLowerCase().includes(q) ||
          r.guardian_name.toLowerCase().includes(q)
        );
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
      pagination: {
        currentPage:   pageNum,
        totalPages,
        totalRecords:  total,
        recordsPerPage: limitNum,
        hasNextPage:   pageNum < totalPages,
        hasPrevPage:   pageNum > 1,
        startIndex:    total === 0 ? 0 : startIndex + 1,
        endIndex,
      },
    });
  } catch (error) {
    console.error("getStudentsByClassAndSubsession error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch class students" });
  }
};

module.exports = { getStudentsByClassAndSubsession };
