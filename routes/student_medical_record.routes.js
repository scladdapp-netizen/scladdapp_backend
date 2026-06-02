const express = require("express");
const router = express.Router();
const {
  createMedicalRecord,
  updateMedicalRecord,
  getMedicalRecordsByStudentId,
  getMedicalRecordById,
  deleteMedicalRecord,
} = require("../controllers/student_medical_record.controller");

// Create medical record
router.post("/", async (req, res) => {
  try {
    const result = await createMedicalRecord(req.body);
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

// Get medical records by student ID
router.get("/student/:studentId", async (req, res) => {
  try {
    const result = await getMedicalRecordsByStudentId(req.params.studentId);
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

// Get medical record by ID
router.get("/:recordId", async (req, res) => {
  try {
    const result = await getMedicalRecordById(req.params.recordId);
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

// Update medical record
router.put("/:recordId", async (req, res) => {
  try {
    const result = await updateMedicalRecord(req.params.recordId, req.body);
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

// Delete medical record
router.delete("/:recordId", async (req, res) => {
  try {
    const result = await deleteMedicalRecord(req.params.recordId);
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
