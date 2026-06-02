const express = require("express");
const router = express.Router();
const { getStudentsByClassAndSubsession } = require("../controllers/class_students.controller");

// GET /api/class-students/:classId/subsession/:subsessionId
router.get("/:classId/subsession/:subsessionId", getStudentsByClassAndSubsession);

module.exports = router;
