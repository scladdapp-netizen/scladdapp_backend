const express = require("express");
const {
  createTeacher,
  getTeacherById,
  getTeacherDetail,
  getTeacherByStaffId,
  getTeachersBySchoolId,
  updateTeacher,
  revokeTeacher,
  reactivateTeacher,
  deleteTeacher,
  changeTeacherAssignment,
  getTeacherAssignmentHistory,
} = require("../controllers/teacher.controller");
const {
  getTeachersBySchoolIdPaginated,
} = require("../controllers/teacher.controller.paginated");
const { logActivity } = require("../controllers/staff_activity.controller");

const router = express.Router();

// POST route for creating teacher
router.post("/", async (req, res) => {
  try {
    const teacherData = req.body;

    if (!teacherData.staff_id || !teacherData.teacher_code || !teacherData.school_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Staff ID, teacher code, and school ID are required",
      });
    }

    const result = await createTeacher(teacherData);

    if (!result.success) {
      const statusCode =
        result.error === "Staff not found" ? 404 :
        result.error === "Teacher code already exists" ||
        result.error === "Staff already a teacher" ||
        result.error === "Missing required fields" ? 400 : 500;
      return res.status(statusCode).json(result);
    }

    logActivity(
      teacherData.appointed_by || "system",
      teacherData.school_id,
      "CREATE_TEACHER",
      "Teachers",
      `Appointed staff ${teacherData.staff_id} as teacher (code: ${teacherData.teacher_code})`,
      "success",
      "admin"
    );

    return res.status(201).json(result);
  } catch (error) {
    console.error("Create teacher route error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// PUT route for updating teacher
router.put("/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacherData = req.body;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: "Missing teacher ID",
        message: "Teacher ID is required",
      });
    }

    const result = await updateTeacher(teacherId, teacherData);

    if (!result.success) {
      const statusCode =
        result.error === "Teacher not found"
          ? 404
          : result.error === "Teacher code already exists"
          ? 400
          : 500;

      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Update teacher route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message || "An unexpected error occurred while updating teacher",
    });
  }
});

// GET route for getting teacher by ID
router.get("/:teacherId/detail", async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: "Missing teacher ID",
        message: "Teacher ID is required",
      });
    }

    const result = await getTeacherDetail(teacherId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get teacher detail route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving teacher detail",
    });
  }
});

// GET route for getting teacher by ID
router.get("/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: "Missing teacher ID",
        message: "Teacher ID is required",
      });
    }

    const result = await getTeacherById(teacherId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get teacher route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving teacher",
    });
  }
});

// GET route for getting teacher by staff ID
router.get("/staff/:staffId/school/:schoolId", async (req, res) => {
  try {
    const { staffId, schoolId } = req.params;

    if (!staffId || !schoolId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
        message: "Staff ID and School ID are required",
      });
    }

    const result = await getTeacherByStaffId(staffId, schoolId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get teacher by staff ID route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving teacher",
    });
  }
});

// GET route for getting paginated teachers by school ID (must be before /school/:schoolId)
router.get("/school/:schoolId/paginated", getTeachersBySchoolIdPaginated);

// GET route for getting all teachers by school ID
router.get("/school/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: "Missing school ID",
        message: "School ID is required",
      });
    }

    const result = await getTeachersBySchoolId(schoolId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get school teachers route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving teachers",
    });
  }
});

// PATCH route for revoking teacher (soft delete)
router.patch("/:teacherId/revoke", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { revoked_by } = req.body;

    if (!teacherId) {
      return res.status(400).json({ success: false, error: "Missing teacher ID", message: "Teacher ID is required" });
    }

    const result = await revokeTeacher(teacherId, revoked_by);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logActivity(
      revoked_by || "system",
      result.data?.school_id,
      "REVOKE_TEACHER",
      "Teachers",
      `Revoked teacher role for teacher ${teacherId}`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Revoke teacher route error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// PATCH route for reactivating teacher
router.patch("/:teacherId/reactivate", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { reactivated_by } = req.body;

    if (!teacherId) {
      return res.status(400).json({ success: false, error: "Missing teacher ID", message: "Teacher ID is required" });
    }

    const result = await reactivateTeacher(teacherId, reactivated_by);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logActivity(
      reactivated_by || "system",
      result.data?.school_id,
      "REACTIVATE_TEACHER",
      "Teachers",
      `Reactivated teacher role for teacher ${teacherId}`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Reactivate teacher route error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// PATCH route for changing teacher assignment
router.patch("/:teacherId/change-assignment", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { new_staff_id, changed_by } = req.body;

    if (!teacherId) {
      return res.status(400).json({ success: false, error: "Missing teacher ID", message: "Teacher ID is required" });
    }

    if (!new_staff_id) {
      return res.status(400).json({ success: false, error: "Missing new staff ID", message: "New staff ID is required" });
    }

    const result = await changeTeacherAssignment(teacherId, new_staff_id, changed_by);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logActivity(
      changed_by || "system",
      result.data?.school_id,
      "CHANGE_TEACHER_ASSIGNMENT",
      "Teachers",
      `Changed assignment for teacher ${teacherId} to staff ${new_staff_id}`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Change teacher assignment route error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

// GET route for getting teacher assignment history
router.get("/:teacherId/assignment-history", async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: "Missing teacher ID",
        message: "Teacher ID is required",
      });
    }

    const result = await getTeacherAssignmentHistory(teacherId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get teacher assignment history route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message:
        error.message ||
        "An unexpected error occurred while retrieving assignment history",
    });
  }
});

// DELETE route for deleting teacher (hard delete)
router.delete("/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({ success: false, error: "Missing teacher ID", message: "Teacher ID is required" });
    }

    // Read teacher info before deletion for the log
    const { readData } = require("../utils/file");
    const teachers = readData("./data/teachers.json");
    const teacher = teachers.find((t) => t.teacher_id === teacherId);

    const result = await deleteTeacher(teacherId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logActivity(
      req.body?.deleted_by || "system",
      teacher?.school_id,
      "DELETE_TEACHER",
      "Teachers",
      `Deleted teacher ${teacherId} (code: ${teacher?.teacher_code})`,
      "success",
      "admin"
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Delete teacher route error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

module.exports = router;
