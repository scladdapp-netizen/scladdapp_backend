const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/student_class_assignment.controller");

// Get all assignments for a student
router.get("/student/:studentId", assignmentController.getAssignmentsByStudent);

// Get all assignments for a class (with optional session filter)
router.get("/class/:classId", assignmentController.getAssignmentsByClass);

// Get active assignment for a student in a specific session
router.get(
  "/student/:studentId/session/:sessionId/active",
  assignmentController.getActiveAssignment
);

// Get all assignments for a session (with pagination)
router.get("/session/:sessionId", assignmentController.getAssignmentsBySession);

// Get active student counts grouped by class for a school
router.get("/school/:schoolId/counts", assignmentController.getActiveCountsBySchool);

module.exports = router;
