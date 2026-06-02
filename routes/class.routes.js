const express = require("express");
const router = express.Router();
const {
  createClass,
  getClassById,
  getClassDetail,
  getClassesBySchoolId,
  updateClass,
  deleteClass,
  updateClassStatus,
  hardDeleteClass,
} = require("../controllers/class.controller");
const {
  getClassesBySchoolIdPaginated,
} = require("../controllers/class.controller.paginated");
const { logActivity } = require("../controllers/staff_activity.controller");

// Create class
router.post("/", async (req, res) => {
  try {
    const result = await createClass(req.body);
    if (result.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_CLASS",
        "Classes",
        `Created class "${req.body.className}" (${req.body.classCode})`,
        "success",
        "admin"
      );
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get all classes by school ID with pagination
router.get("/school/:schoolId/paginated", getClassesBySchoolIdPaginated);

// Get class detail with headmaster assignments
router.get("/:classId/detail", async (req, res) => {
  try {
    const result = await getClassDetail(req.params.classId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get all classes by school ID
router.get("/school/:schoolId", async (req, res) => {
  try {
    const result = await getClassesBySchoolId(req.params.schoolId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Get class by ID
router.get("/:classId", async (req, res) => {
  try {
    const result = await getClassById(req.params.classId);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Update class
router.put("/:classId", async (req, res) => {
  try {
    const result = await updateClass(req.params.classId, req.body);
    if (result.success) {
      logActivity(
        req.body.modified_by || "system",
        result.data?.class?.school_id,
        "EDIT_CLASS",
        "Classes",
        `Updated class "${result.data?.class?.class_name}" (${req.params.classId})`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Update class status (activate/deactivate)
router.patch("/:classId/status", async (req, res) => {
  try {
    const { is_active, modified_by, school_id } = req.body;
    const result = await updateClassStatus(req.params.classId, is_active);
    if (result.success) {
      logActivity(
        modified_by || "system",
        school_id || result.data?.school_id,
        is_active ? "ACTIVATE_CLASS" : "DEACTIVATE_CLASS",
        "Classes",
        `${is_active ? "Activated" : "Deactivated"} class ${req.params.classId}`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Delete class (soft delete)
router.delete("/:classId", async (req, res) => {
  try {
    const { readData } = require("../utils/file");
    const path = require("path");
    const classes = readData(path.join(__dirname, "../data/classes.json"));
    const cls = classes.find((c) => c.class_id === req.params.classId);

    const result = await deleteClass(req.params.classId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        cls?.school_id,
        "DELETE_CLASS",
        "Classes",
        `Deleted class "${cls?.class_name}" (${req.params.classId})`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// Hard delete class (permanently remove)
router.delete("/:classId/hard", async (req, res) => {
  try {
    const { readData } = require("../utils/file");
    const path = require("path");
    const classes = readData(path.join(__dirname, "../data/classes.json"));
    const cls = classes.find((c) => c.class_id === req.params.classId);

    const result = await hardDeleteClass(req.params.classId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        cls?.school_id,
        "DELETE_CLASS",
        "Classes",
        `Permanently deleted class "${cls?.class_name}" (${req.params.classId})`,
        "success",
        "admin"
      );
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

module.exports = router;

// Get all classes by school ID with pagination (NEW - server-side pagination)
router.get("/school/:schoolId/paginated", getClassesBySchoolIdPaginated);

// Get class detail with headmaster assignments (MUST be before /:classId)
router.get("/:classId/detail", async (req, res) => {
  try {
    const result = await getClassDetail(req.params.classId);
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

// Get all classes by school ID (OLD - returns all classes)
router.get("/school/:schoolId", async (req, res) => {
  try {
    const result = await getClassesBySchoolId(req.params.schoolId);
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

// Get class by ID
router.get("/:classId", async (req, res) => {
  try {
    const result = await getClassById(req.params.classId);
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

// Update class
router.put("/:classId", async (req, res) => {
  try {
    const result = await updateClass(req.params.classId, req.body);
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

// Update class status (activate/deactivate)
router.patch("/:classId/status", async (req, res) => {
  try {
    const { is_active } = req.body;
    const result = await updateClassStatus(req.params.classId, is_active);
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

// Delete class (soft delete)
router.delete("/:classId", async (req, res) => {
  try {
    const result = await deleteClass(req.params.classId);
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

// Hard delete class (permanently remove)
router.delete("/:classId/hard", async (req, res) => {
  try {
    const result = await hardDeleteClass(req.params.classId);
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
