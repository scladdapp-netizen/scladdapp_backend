const StudentAttendance = require("../models/StudentAttendance.model");

const markAttendance = async (attendanceData) => {
  try {
    if (!attendanceData.student_id || !attendanceData.school_id || !attendanceData.session_id ||
        !attendanceData.subsession_id || !attendanceData.attendance_date || !attendanceData.status) {
      return { success: false, error: "Missing required fields", message: "All fields are required" };
    }

    const existing = await StudentAttendance.findOne({
      student_id:      attendanceData.student_id,
      attendance_date: attendanceData.attendance_date,
      subsession_id:   attendanceData.subsession_id,
    });

    if (existing) {
      existing.status    = attendanceData.status;
      if (attendanceData.notes)     existing.notes     = attendanceData.notes;
      if (attendanceData.marked_by) existing.marked_by = attendanceData.marked_by;
      existing.marked_at  = new Date();
      existing.updated_at = new Date();
      await existing.save();
      return { success: true, data: existing, message: "Attendance updated successfully" };
    }

    const record = await StudentAttendance.create({
      attendance_id:   Date.now().toString(),
      student_id:      attendanceData.student_id,
      school_id:       attendanceData.school_id,
      class_id:        attendanceData.class_id || null,
      session_id:      attendanceData.session_id,
      subsession_id:   attendanceData.subsession_id,
      attendance_date: attendanceData.attendance_date,
      status:          attendanceData.status,
      marked_by:       attendanceData.marked_by || null,
      marked_at:       new Date(),
      notes:           attendanceData.notes || null,
    });

    return { success: true, data: record, message: "Attendance marked successfully" };
  } catch (error) {
    console.error("Mark attendance error:", error);
    return { success: false, error: "Mark attendance failed", message: error.message || "Failed to mark attendance" };
  }
};

const getAttendanceBySubsession = async (studentId, subsessionId) => {
  try {
    const records = await StudentAttendance.find({ student_id: studentId, subsession_id: subsessionId })
      .sort({ attendance_date: 1 }).lean();
    return { success: true, data: records, message: "Attendance records retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get attendance failed", message: error.message || "Failed to retrieve attendance" };
  }
};

const getAttendanceSummary = async (studentId, subsessionId) => {
  try {
    const records = await StudentAttendance.find({ student_id: studentId, subsession_id: subsessionId }).lean();
    const summary = {
      present: records.filter((a) => a.status === "present").length,
      absent:  records.filter((a) => a.status === "absent").length,
      excused: records.filter((a) => a.status === "excused").length,
      total:   records.length,
    };
    return { success: true, data: summary, message: "Attendance summary retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get attendance summary failed", message: error.message || "Failed to retrieve attendance summary" };
  }
};

const deleteAttendance = async (studentId, subsessionId, attendanceDate) => {
  try {
    const record = await StudentAttendance.findOneAndDelete({
      student_id:      studentId,
      subsession_id:   subsessionId,
      attendance_date: attendanceDate,
    });
    if (!record) return { success: false, error: "Attendance record not found", message: "Attendance record not found" };
    return { success: true, message: "Attendance record deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete attendance failed", message: error.message || "Failed to delete attendance" };
  }
};

module.exports = { markAttendance, getAttendanceBySubsession, getAttendanceSummary, deleteAttendance };
