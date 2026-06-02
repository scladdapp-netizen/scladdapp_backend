const Subsession = require("../models/Subsession.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Student = require("../models/Student.model");
const StudentAttendance = require("../models/StudentAttendance.model");

/**
 * GET /api/class-attendance/:classId/subsession/:subsessionId
 * Returns all students in the class with their attendance map for the subsession.
 */
const getClassAttendance = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;

    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return res.status(404).json({ success: false, message: "Subsession not found" });

    const sessionId = subsession.session_id;

    const assignments = await StudentClassAssignment.find({
      class_id: classId,
      session_id: sessionId,
      is_active: true,
    }).lean();

    const studentIds = assignments.map((a) => a.student_id);

    const [students, attendanceRecords] = await Promise.all([
      Student.find({ student_id: { $in: studentIds } }).lean(),
      StudentAttendance.find({ subsession_id: subsessionId, student_id: { $in: studentIds } }).lean(),
    ]);

    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    const attendanceMap = {};
    attendanceRecords.forEach((r) => {
      if (!attendanceMap[r.student_id]) attendanceMap[r.student_id] = {};
      attendanceMap[r.student_id][r.attendance_date] = r.status;
    });

    const result = assignments.map((a) => ({
      id:         a.student_id,
      name:       studentMap[a.student_id]?.full_name || "Unknown",
      attendance: attendanceMap[a.student_id] || {},
    }));

    return res.json({
      success: true,
      data: {
        students: result,
        subsession: {
          term_id:         subsession.term_id,
          term_name:       subsession.term_name,
          term_start_date: subsession.term_start_date,
          term_end_date:   subsession.term_end_date,
          session_id:      sessionId,
        },
      },
    });
  } catch (error) {
    console.error("getClassAttendance error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/class-attendance/:classId/subsession/:subsessionId/date/:date
 * Returns attendance records for all students in the class for a specific date.
 */
const getClassAttendanceByDate = async (req, res) => {
  try {
    const { classId, subsessionId, date } = req.params;

    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return res.status(404).json({ success: false, message: "Subsession not found" });

    const assignments = await StudentClassAssignment.find({
      class_id:   classId,
      session_id: subsession.session_id,
      is_active:  true,
    }).lean();

    const studentIds = assignments.map((a) => a.student_id);

    const dayRecords = await StudentAttendance.find({
      subsession_id:   subsessionId,
      attendance_date: date,
      student_id:      { $in: studentIds },
    }).lean();

    return res.json({ success: true, data: dayRecords });
  } catch (error) {
    console.error("getClassAttendanceByDate error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClassAttendance, getClassAttendanceByDate };
