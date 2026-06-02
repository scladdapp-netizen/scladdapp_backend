const express = require("express");
const router = express.Router();
const {
  createGuardian,
  getGuardianById,
  getGuardiansByStudentId,
  updateGuardian,
  deleteGuardian,
  setPrimaryGuardian,
} = require("../controllers/guardian.controller");

// Create guardian
router.post("/", async (req, res) => {
  try {
    const result = await createGuardian(req.body);
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

// Get guardian by ID
router.get("/:guardianId", async (req, res) => {
  try {
    const result = await getGuardianById(req.params.guardianId);
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

// Get all guardians for a student
router.get("/student/:studentId", async (req, res) => {
  try {
    const result = await getGuardiansByStudentId(req.params.studentId);
    if (result.success) {
      res.status(200).json(result);
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

// Update guardian
router.put("/:guardianId", async (req, res) => {
  try {
    const result = await updateGuardian(req.params.guardianId, req.body);
    if (result.success) {
      res.status(200).json(result);
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

// Delete guardian
router.delete("/:guardianId", async (req, res) => {
  try {
    const result = await deleteGuardian(req.params.guardianId);
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

// Set primary guardian
router.patch("/:guardianId/set-primary", async (req, res) => {
  try {
    const { studentId } = req.body;
    const result = await setPrimaryGuardian(req.params.guardianId, studentId);
    if (result.success) {
      res.status(200).json(result);
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

module.exports = router;
