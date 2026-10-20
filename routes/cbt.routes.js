const express = require("express");
const { authenticate, requireStaff, requireStudent } = require("../middleware/cbtAuth");
const staff = require("../controllers/cbt.controller");
const exam = require("../controllers/cbtExam.controller");

const router = express.Router();

router.use(authenticate);

// ── Student exam access (no test list; entered with an exam code) ─────────────
router.post("/exam/access", requireStudent, exam.accessExam);
router.post("/exam/:testId/start", requireStudent, exam.startExam);
router.get("/exam/attempts/:attemptId", requireStudent, exam.resumeExam);
router.put("/exam/attempts/:attemptId/answers", requireStudent, exam.saveAnswers);
router.post("/exam/attempts/:attemptId/submit", requireStudent, exam.submitExam);
router.get("/exam/results", requireStudent, exam.listResults);
router.get("/exam/results/:attemptId", requireStudent, exam.getResult);

// ── Teachers and admins ───────────────────────────────────────────────────────
router.use(requireStaff);
router.get("/context", staff.getContext);
router.get("/tests", staff.listTests);
router.post("/tests", staff.createTest);
router.get("/tests/:testId", staff.getTest);
router.patch("/tests/:testId", staff.updateTest);
router.delete("/tests/:testId", staff.removeTest);
router.get("/tests/:testId/validation", staff.getValidation);
router.get("/tests/:testId/students", staff.listStudents);
router.post("/tests/:testId/publish", staff.publishTest);
router.patch("/tests/:testId/assignments", staff.updateAssignments);
router.post("/tests/:testId/access-code", staff.regenerateCode);
router.patch("/tests/:testId/deadline", staff.extendDeadline);
router.post("/tests/:testId/close", staff.closeTest);
router.get("/tests/:testId/results", staff.getResults);
router.get("/tests/:testId/attempts/:attemptId", staff.getAttempt);
router.patch("/tests/:testId/attempts/:attemptId/grades", staff.gradeAttempt);
router.get("/tests/:testId/release-preview", staff.getReleasePreview);
router.post("/tests/:testId/release", staff.releaseResults);
router.get("/tests/:testId/audit", staff.getAudit);
router.get("/tests/:testId/roster", staff.getRoster);
router.get("/tests/:testId/analysis", staff.getAnalysis);
router.get("/tests/:testId/questions/:questionId/answers", staff.getQuestionAnswers);
router.post("/tests/:testId/sessions", staff.startSessions);
router.post("/tests/:testId/reopen", staff.reopenTest);
router.post("/tests/:testId/attempts/:attemptId/end", staff.endSession);
router.patch("/tests/:testId/attempts/:attemptId/time", staff.addTime);
router.patch("/tests/:testId/students/:studentId/absent", staff.markAbsent);
router.patch("/tests/:testId/students/:studentId/counted", staff.setCounted);

module.exports = router;
