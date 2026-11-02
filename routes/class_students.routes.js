const express = require("express");
const router = express.Router();
const { getStudentsByClassAndSubsession, getCandidateStudents, addStudentsToClass } = require("../controllers/class_students.controller");

router.get("/:classId/subsession/:subsessionId/candidates", getCandidateStudents);
router.post("/:classId/subsession/:subsessionId", addStudentsToClass);
router.get("/:classId/subsession/:subsessionId", getStudentsByClassAndSubsession);

module.exports = router;
