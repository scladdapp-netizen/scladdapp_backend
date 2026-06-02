const express = require("express");
const router = express.Router();
const {
  createAdmission,
  getAdmissionById,
  getAdmissionsByStudentId,
  getAdmissionsBySchoolId,
  updateAdmission,
  closeAdmission,
  deleteAdmission,
} = require("../controllers/admission.controller");

// Create admission
router.post("/", async (req, res) => {
  try {
    const result = await createAdmission(req.body);
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

// Get admission by ID
router.get("/:admissionId", async (req, res) => {
  try {
    const result = await getAdmissionById(req.params.admissionId);
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

// Get all admissions for a student
router.get("/student/:studentId", async (req, res) => {
  try {
    const result = await getAdmissionsByStudentId(req.params.studentId);
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

// Get all admissions for a school
router.get("/school/:schoolId", async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== "false"; // Default to true
    const result = await getAdmissionsBySchoolId(
      req.params.schoolId,
      activeOnly
    );
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

// Update admission
router.put("/:admissionId", async (req, res) => {
  try {
    const result = await updateAdmission(req.params.admissionId, req.body);
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

// Close admission (when student leaves school)
router.patch("/:admissionId/close", async (req, res) => {
  try {
    const { closeDate, remarks } = req.body;
    const result = await closeAdmission(
      req.params.admissionId,
      closeDate,
      remarks
    );
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

// Delete admission
router.delete("/:admissionId", async (req, res) => {
  try {
    const result = await deleteAdmission(req.params.admissionId);
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
