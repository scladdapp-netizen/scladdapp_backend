const express = require("express");
const router = express.Router();
const {
  createSubsession,
  getSubsessionsBySessionId,
  getSubsessionsBySchoolId,
  getSubsessionById,
  updateSubsession,
  updateSubsessionStatus,
  deleteSubsession,
} = require("../controllers/subsession.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

/**
 * @route   POST /subsession
 * @desc    Create a new subsession
 */
router.post("/", async (req, res) => {
  try {
    const result = await createSubsession(req.body);
    if (result.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_SUBSESSION",
        "Session",
        `Created subsession "${req.body.term_name}" (${req.body.term_code}) in session ID ${req.body.session_id}`,
        "success",
        "admin"
      );
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

/**
 * @route   GET /subsession/session/:sessionId
 * @desc    Get all subsessions for a session
 */
router.get("/session/:sessionId", async (req, res) => {
  try {
    const result = await getSubsessionsBySessionId(req.params.sessionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   GET /subsession/school/:schoolId
 * @desc    Get all subsessions for a school
 */
router.get("/school/:schoolId", async (req, res) => {
  try {
    const result = await getSubsessionsBySchoolId(req.params.schoolId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

/**
 * @route   GET /subsession/:termId
 * @desc    Get subsession by ID
 */
router.get("/:termId", async (req, res) => {
  try {
    const result = await getSubsessionById(req.params.termId);
    if (result.success) {
      res.json(result);
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

/**
 * @route   PUT /subsession/:termId
 * @desc    Update subsession
 */
router.put("/:termId", async (req, res) => {
  try {
    console.log("🔍 [subsession PUT] req.body:", JSON.stringify(req.body));
    console.log("🔍 [subsession PUT] modified_by:", req.body.modified_by);
    const result = await updateSubsession(req.params.termId, req.body);
    if (result.success) {
      logActivity(
        req.body.modified_by || req.body.created_by || "system",
        result.data.school_id,
        "EDIT_SUBSESSION",
        "Session",
        `Updated subsession "${result.data.term_name}" (${result.data.term_code})`,
        "success",
        "admin"
      );
      res.json(result);
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

/**
 * @route   PATCH /subsession/:termId/status
 * @desc    Update subsession status
 */
router.patch("/:termId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await updateSubsessionStatus(req.params.termId, status);
    if (result.success) {
      const action = status === "archived" ? "ARCHIVE_SUBSESSION" : "EDIT_SUBSESSION";
      logActivity(
        req.body.modified_by || "system",
        result.data.school_id,
        action,
        "Session",
        `Changed subsession "${result.data.term_name}" status to "${status}"`,
        "success",
        "admin"
      );
      res.json(result);
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

/**
 * @route   DELETE /subsession/:termId
 * @desc    Delete subsession
 */
router.delete("/:termId", async (req, res) => {
  try {
    // Read subsession info before deletion so we can log it
    const { readData } = require("../utils/file");
    const subsessions = readData(require("path").join(__dirname, "../data/subsessions.json"));
    const subsession = subsessions.find((s) => s.term_id === req.params.termId);

    const result = await deleteSubsession(req.params.termId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        subsession?.school_id,
        "DELETE_SUBSESSION",
        "Session",
        `Deleted subsession "${subsession?.term_name}" (${subsession?.term_code})`,
        "success",
        "admin"
      );
      res.json(result);
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
