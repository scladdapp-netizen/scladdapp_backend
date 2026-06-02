const express = require("express");
const router = express.Router();
const {
  getSubjectsByClass,
  getSubjectsHistoryByClass,
  getClassesBySubject,
  deactivateClassSubject,
  deleteClassSubject,
  assignSubjectToClass,
  restoreClassSubject,
} = require("../controllers/class_subjects.controller");

// GET /api/class-subjects/:classId
router.get("/:classId", getSubjectsByClass);

// GET /api/class-subjects/:classId/history
router.get("/:classId/history", getSubjectsHistoryByClass);

// GET /api/class-subjects/by-subject/:subjectId
router.get("/by-subject/:subjectId", getClassesBySubject);

// POST /api/class-subjects
router.post("/", assignSubjectToClass);

// PATCH /api/class-subjects/:assignmentId/restore
router.patch("/:assignmentId/restore", restoreClassSubject);

// PATCH /api/class-subjects/:assignmentId/deactivate
router.patch("/:assignmentId/deactivate", deactivateClassSubject);

// DELETE /api/class-subjects/:assignmentId
router.delete("/:assignmentId", deleteClassSubject);

module.exports = router;
