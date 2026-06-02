const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/student_report.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Get scores by subject + subsession (paginated)
router.get("/subject/:subjectId/subsession/:subsessionId/scores", async (req, res) => {
  const result = await ctrl.getScoresBySubjectSubsession(
    req.params.subjectId,
    req.params.subsessionId,
    req.query
  );
  res.status(result.success ? 200 : 400).json(result);
});

// Subject positions for a student in a subsession (requires ?classId=)
router.get("/student/:studentId/subsession/:subsessionId/subject-positions", async (req, res) => {
  const result = await ctrl.getSubjectPositions(req.params.studentId, req.params.subsessionId, req.query.classId || null);
  res.status(result.success ? 200 : 400).json(result);
});

// Class average for a subsession — optional ?classId= query param
router.get("/subsession/:subsessionId/class-average", async (req, res) => {
  const result = await ctrl.getClassAverage(req.params.subsessionId, req.query.classId || null);
  res.status(result.success ? 200 : 400).json(result);
});

// Get scores for a student in a subsession
router.get("/student/:studentId/subsession/:subsessionId/scores", async (req, res) => {
  const result = await ctrl.getScoresByStudentSubsession(req.params.studentId, req.params.subsessionId);
  res.status(result.success ? 200 : 404).json(result);
});

// Generate / refresh report
router.post("/student/:studentId/subsession/:subsessionId/generate", async (req, res) => {
  const result = await ctrl.generateReport(req.params.studentId, req.params.subsessionId);
  if (result.success) {
    logActivity(
      req.body?.modified_by || "system",
      result.data?.school_id,
      "GENERATE_REPORT",
      "Student Report",
      `Generated report for student ${req.params.studentId} in subsession ${req.params.subsessionId}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 200 : 400).json(result);
});

// Get report
router.get("/student/:studentId/subsession/:subsessionId", async (req, res) => {
  const result = await ctrl.getReport(req.params.studentId, req.params.subsessionId);
  res.status(result.success ? 200 : 404).json(result);
});

// Get all reports for a student
router.get("/student/:studentId", async (req, res) => {
  const result = await ctrl.getReportsByStudent(req.params.studentId);
  res.status(result.success ? 200 : 400).json(result);
});

// Update comments
router.patch("/student/:studentId/subsession/:subsessionId/comments", async (req, res) => {
  const result = await ctrl.updateComments(req.params.studentId, req.params.subsessionId, req.body);
  if (result.success) {
    logActivity(
      req.body?.modified_by || "system",
      result.data?.school_id,
      "UPDATE_REPORT_COMMENTS",
      "Student Report",
      `Updated comments for student ${req.params.studentId} in subsession ${req.params.subsessionId}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 200 : 404).json(result);
});

// Update subject scores
router.patch("/student/:studentId/subsession/:subsessionId/subject/:subjectId/scores", async (req, res) => {
  const result = await ctrl.updateSubjectScore(
    req.params.studentId,
    req.params.subsessionId,
    req.params.subjectId,
    req.body.scores
  );
  if (result.success) {
    logActivity(
      req.body?.modified_by || "system",
      result.data?.school_id,
      "UPDATE_SCORES",
      "Student Report",
      `Updated scores for student ${req.params.studentId}, subject ${req.params.subjectId}`,
      "success",
      "staff"
    );
  }
  res.status(result.success ? 200 : 404).json(result);
});

// Add a new subject score
router.post("/student/:studentId/subsession/:subsessionId/subject", async (req, res) => {
  const result = await ctrl.addSubjectScore(req.params.studentId, req.params.subsessionId, req.body);
  if (result.success) {
    logActivity(
      req.body?.modified_by || "system",
      result.data?.school_id,
      "ADD_SUBJECT_SCORE",
      "Student Report",
      `Added score for student ${req.params.studentId}, subject ${req.body.subject_id}`,
      "success",
      "staff"
    );
  }
  res.status(result.success ? 200 : 400).json(result);
});

// Get preview data (assembled for ReportCardPreview component)
router.get("/student/:studentId/subsession/:subsessionId/preview", async (req, res) => {
  const result = await ctrl.getPreviewData(req.params.studentId, req.params.subsessionId);
  res.status(result.success ? 200 : 400).json(result);
});

// Get all students with report card status for a subsession
router.get("/subsession/:subsessionId/report-cards", async (req, res) => {
  const result = await ctrl.getStudentsWithReportCardsBySubsession(req.params.subsessionId, req.query);
  res.status(result.success ? 200 : 400).json(result);
});

// Get report card (remarks + publish status)
router.get("/student/:studentId/subsession/:subsessionId/report-card", async (req, res) => {
  const result = await ctrl.getReportCard(req.params.studentId, req.params.subsessionId);
  res.status(result.success ? 200 : 404).json(result);
});

// Save (create or update) report card
router.post("/student/:studentId/subsession/:subsessionId/report-card", async (req, res) => {
  const result = await ctrl.saveReportCard(req.params.studentId, req.params.subsessionId, req.body);
  if (result.success) {
    const action = req.body.is_published === true ? "PUBLISH_REPORT_CARD" : "SAVE_REPORT_CARD";
    logActivity(
      req.body?.modified_by || "system",
      result.data?.school_id,
      action,
      "Student Report",
      `${req.body.is_published === true ? "Published" : "Saved"} report card for student ${req.params.studentId}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 200 : 400).json(result);
});

// Delete report
router.delete("/student/:studentId/subsession/:subsessionId", async (req, res) => {
  const result = await ctrl.deleteReport(req.params.studentId, req.params.subsessionId);
  if (result.success) {
    logActivity(
      req.body?.deleted_by || "system",
      null,
      "DELETE_REPORT",
      "Student Report",
      `Deleted report for student ${req.params.studentId} in subsession ${req.params.subsessionId}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 200 : 404).json(result);
});

module.exports = router;
