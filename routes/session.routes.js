const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/session.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Create a complete session with all related data (headmasters, teacher-subjects, subsessions)
router.post("/complete", async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success && body?.data?.session) {
      const { school_id, created_by, session_name, session_code } = req.body;
      logActivity(
        created_by || "system",
        school_id,
        "CREATE_SESSION",
        "Session",
        `Created complete session "${session_name}" (${session_code}) with ${req.body.subsessions?.length || 0} subsession(s)`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  sessionController.createCompleteSession(req, res, next);
});

// Create a new session
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      const { school_id, created_by, session_name, session_code } = req.body;
      logActivity(
        created_by || "system",
        school_id,
        "CREATE_SESSION",
        "Session",
        `Created session "${session_name}" (${session_code})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  sessionController.createSession(req, res, next);
});

// Get all sessions for a school
router.get("/school/:schoolId", sessionController.getSessionsBySchool);

// Get active session and subsession for a school (based on server date)
router.get("/school/:schoolId/active", sessionController.getActiveSessionAndSubsession);

// Get a single session by ID
router.get("/:sessionId", sessionController.getSessionById);

// Update a session
router.put("/:sessionId", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      const { modified_by, session_name, session_code } = req.body;
      console.log("🔍 [session PUT] req.body:", JSON.stringify(req.body));
      console.log("🔍 [session PUT] modified_by extracted:", modified_by);
      const session = body.data;
      logActivity(
        modified_by || "system",
        session?.school_id,
        "EDIT_SESSION",
        "Session",
        `Updated session "${session?.session_name || session_name}" (${session?.session_code || session_code})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  sessionController.updateSession(req, res, next);
});

// Delete a session
router.delete("/:sessionId", async (req, res, next) => {
  // Read session info before deletion so we can log it
  const { readData } = require("../utils/file");
  const sessions = readData("./data/sessions.json");
  const session = sessions.find((s) => s.session_id === req.params.sessionId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        session?.school_id,
        "DELETE_SESSION",
        "Session",
        `Deleted session "${session?.session_name}" (${session?.session_code}) and ${body.data?.subsessions_deleted || 0} subsession(s)`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  sessionController.deleteSession(req, res, next);
});

// Update session status (archive / activate / etc.)
router.patch("/:sessionId/status", (req, res, next) => {
  const { readData } = require("../utils/file");
  const sessions = readData("./data/sessions.json");
  const session = sessions.find((s) => s.session_id === req.params.sessionId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      const { session_status, modified_by } = req.body;
      const action = session_status === "archived" ? "ARCHIVE_SESSION" : "EDIT_SESSION";
      logActivity(
        modified_by || "system",
        session?.school_id,
        action,
        "Session",
        `Changed session "${session?.session_name}" status to "${session_status}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  sessionController.updateSessionStatus(req, res, next);
});

module.exports = router;
