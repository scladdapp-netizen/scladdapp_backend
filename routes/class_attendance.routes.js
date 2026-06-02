const express = require("express");
const router = express.Router();
const { getClassAttendance, getClassAttendanceByDate } = require("../controllers/class_attendance.controller");

// GET /api/class-attendance/:classId/subsession/:subsessionId
router.get("/:classId/subsession/:subsessionId", getClassAttendance);

// GET /api/class-attendance/:classId/subsession/:subsessionId/date/:date
router.get("/:classId/subsession/:subsessionId/date/:date", getClassAttendanceByDate);

module.exports = router;
