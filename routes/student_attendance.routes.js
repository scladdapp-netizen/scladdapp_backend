const express = require("express");
const router = express.Router();
const {
  markAttendance,
  getAttendanceBySubsession,
  getAttendanceSummary,
  deleteAttendance,
} = require("../controllers/student_attendance.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Mark or update attendance
router.post("/", async (req, res) => {
  try {
    const result = await markAttendance(req.body);
    if (result.success) {
      logActivity(
        req.body.marked_by || "system",
        req.body.school_id,
        "MARK_ATTENDANCE",
        "Attendance",
        `Marked ${req.body.status} for student ${req.body.student_id} on ${req.body.attendance_date}`,
        "success",
        "staff"
      );
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get attendance records for a student in a subsession
router.get("/student/:studentId/subsession/:subsessionId", async (req, res) => {
  try {
    const result = await getAttendanceBySubsession(
      req.params.studentId,
      req.params.subsessionId
    );
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// Get attendance summary
router.get("/summary/student/:studentId/subsession/:subsessionId", async (req, res) => {
  try {
    const result = await getAttendanceSummary(
      req.params.studentId,
      req.params.subsessionId
    );
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// Delete attendance record
router.delete("/student/:studentId/subsession/:subsessionId/date/:date", async (req, res) => {
  try {
    const result = await deleteAttendance(
      req.params.studentId,
      req.params.subsessionId,
      req.params.date
    );
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

module.exports = router;
