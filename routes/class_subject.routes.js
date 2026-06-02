const express = require("express");
const router = express.Router();
const {
  assignClassToSubject,
  getClassAssignmentsBySubject,
  getActiveClassAssignment,
  getActiveClassSubjectAssignmentsBySchool,
  endClassAssignment,
  updateClassAssignment,
  deleteClassAssignment,
} = require("../controllers/class_subject.controller");

/**
 * POST /class-subject
 * Assign a class to a subject
 */
router.post("/", async (req, res) => {
  try {
    console.log("POST /class-subject - Request body:", req.body);

    const result = await assignClassToSubject(req.body);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("POST /class-subject error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /class-subject/subject/:subjectId
 * Get all class assignments for a subject
 */
router.get("/subject/:subjectId", async (req, res) => {
  try {
    const { subjectId } = req.params;
    console.log(
      `GET /class-subject/subject/${subjectId} - Getting class assignments`
    );

    const result = await getClassAssignmentsBySubject(subjectId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("GET /class-subject/subject/:subjectId error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /class-subject/subject/:subjectId/active
 * Get active class assignment for a subject
 */
router.get("/subject/:subjectId/active", async (req, res) => {
  try {
    const { subjectId } = req.params;
    console.log(
      `GET /class-subject/subject/${subjectId}/active - Getting active assignment`
    );

    const result = await getActiveClassAssignment(subjectId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("GET /class-subject/subject/:subjectId/active error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * PUT /class-subject/:assignmentId/end
 * End a class assignment
 */
router.put("/:assignmentId/end", async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { endDate } = req.body;

    console.log(
      `PUT /class-subject/${assignmentId}/end - Ending assignment`,
      req.body
    );

    const result = await endClassAssignment(assignmentId, endDate);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("PUT /class-subject/:assignmentId/end error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * PUT /class-subject/:assignmentId
 * Update a class assignment
 */
router.put("/:assignmentId", async (req, res) => {
  try {
    const { assignmentId } = req.params;
    console.log(
      `PUT /class-subject/${assignmentId} - Updating assignment`,
      req.body
    );

    const result = await updateClassAssignment(assignmentId, req.body);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("PUT /class-subject/:assignmentId error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * DELETE /class-subject/:assignmentId
 * Delete a class assignment
 */
router.delete("/:assignmentId", async (req, res) => {
  try {
    const { assignmentId } = req.params;
    console.log(`DELETE /class-subject/${assignmentId} - Deleting assignment`);

    const result = await deleteClassAssignment(assignmentId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("DELETE /class-subject/:assignmentId error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /class-subject/school/:schoolId/active
 * Get active class-subject assignments by school ID
 */
router.get("/school/:schoolId/active", async (req, res) => {
  try {
    const result = await getActiveClassSubjectAssignmentsBySchool(
      req.params.schoolId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("GET /class-subject/school/:schoolId/active error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

module.exports = router;
