const express = require("express");
const router = express.Router();
const {
  assignTeacherToSubject,
  getTeacherSubjectAssignments,
  getActiveTeacherSubjectAssignmentsBySchool,
  updateTeacherSubjectAssignment,
  deactivateTeacherSubjectAssignment,
  getAssignmentsByTeacher,
  deleteTeacherSubjectAssignment,
} = require("../controllers/teacher_subject.controller");
const path = require("path");
const { readData } = require("../utils/file");

/**
 * GET /teacher-subject/assignment/:assignmentId
 * Get a single assignment by ID
 */
router.get("/assignment/:assignmentId", (req, res) => {
  try {
    const assignments = readData(path.join(__dirname, "../data/teacher_subject_assignments.json"));
    const assignment = assignments.find((a) => a.assignment_id === req.params.assignmentId);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /teacher-subject
 * @desc    Assign teacher to subject
 * @access  Private
 */
router.post("/", async (req, res) => {
  try {
    const result = await assignTeacherToSubject(req.body);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   GET /teacher-subject/school/:schoolId/active
 * @desc    Get active teacher-subject assignments by school
 * @access  Private
 */
router.get("/school/:schoolId/active", async (req, res) => {
  try {
    const result = await getActiveTeacherSubjectAssignmentsBySchool(
      req.params.schoolId
    );
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   GET /teacher-subject/subject/:subjectId
 * @desc    Get teacher assignments for a subject
 * @access  Private
 */
router.get("/subject/:subjectId", async (req, res) => {
  try {
    const result = await getTeacherSubjectAssignments(req.params.subjectId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   PUT /teacher-subject/:assignmentId
 * @desc    Update teacher-subject assignment
 * @access  Private
 */
router.put("/:assignmentId", async (req, res) => {
  try {
    const result = await updateTeacherSubjectAssignment(
      req.params.assignmentId,
      req.body
    );
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   PATCH /teacher-subject/:assignmentId/deactivate
 * @desc    Deactivate teacher-subject assignment
 * @access  Private
 */
router.patch("/:assignmentId/deactivate", async (req, res) => {
  try {
    const result = await deactivateTeacherSubjectAssignment(
      req.params.assignmentId
    );
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

module.exports = router;

/**
 * DELETE /teacher-subject/:assignmentId
 * Permanently delete an assignment record
 */
router.delete("/:assignmentId", async (req, res) => {
  try {
    const result = await deleteTeacherSubjectAssignment(req.params.assignmentId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /teacher-subject/teacher/:teacherId
 * Get active subject assignments for a teacher, enriched + paginated
 */
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { page = 1, limit = 20, search = "", history = "false" } = req.query;
    const showHistory = history === "true";

    const result = await getAssignmentsByTeacher(teacherId, showHistory);
    if (!result.success) return res.status(400).json(result);

    let rows = result.data;

    // sort newest first
    rows = rows.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    // search filter
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.subject_name?.toLowerCase().includes(q) ||
          r.subject_code?.toLowerCase().includes(q) ||
          r.class_name?.toLowerCase().includes(q) ||
          r.class_code?.toLowerCase().includes(q)
      );
    }

    const totalRecords = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const currentPage = Math.min(Math.max(1, parseInt(page)), totalPages);
    const startIndex = (currentPage - 1) * parseInt(limit);
    const endIndex = Math.min(startIndex + parseInt(limit), totalRecords);
    const paged = rows.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paged,
      pagination: {
        currentPage,
        totalPages,
        totalRecords,
        recordsPerPage: parseInt(limit),
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        startIndex: totalRecords === 0 ? 0 : startIndex + 1,
        endIndex,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
