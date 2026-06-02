const express = require("express");
const router = express.Router();
const {
  assignHeadmaster,
  getActiveHeadmasterByClassId,
  getHeadmastersByClassId,
  getActiveHeadmastersBySchoolId,
  getHeadmastersByTeacherId,
  removeHeadmaster,
} = require("../controllers/headmaster.controller");

// Assign headmaster to a class
router.post("/", async (req, res) => {
  try {
    const result = await assignHeadmaster(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// Get all active headmasters by school ID
router.get("/school/:schoolId/active", async (req, res) => {
  try {
    const result = await getActiveHeadmastersBySchoolId(req.params.schoolId);
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

// Get active headmaster for a class
router.get("/class/:classId/active", async (req, res) => {
  try {
    const result = await getActiveHeadmasterByClassId(req.params.classId);
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

// Get all headmaster assignments for a class (including history)
router.get("/class/:classId", async (req, res) => {
  try {
    const result = await getHeadmastersByClassId(req.params.classId);
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

// Get all headmaster assignments for a teacher (including history)
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    const result = await getHeadmastersByTeacherId(req.params.teacherId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Remove headmaster (deactivate assignment)
router.delete("/:assignmentId", async (req, res) => {
  try {
    const result = await removeHeadmaster(req.params.assignmentId);
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
