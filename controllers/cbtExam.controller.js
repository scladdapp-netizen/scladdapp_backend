/**
 * CBT student endpoints. Students never see a list of tests: they reach a test by entering the
 * exam code their teacher gives them, and the server only opens it for students who were assigned
 * to it. Identity is the signed login token, never an id supplied by the browser.
 */
const CbtTest = require("../models/CbtTest.model");
const CbtAssignment = require("../models/CbtAssignment.model");
const CbtAttempt = require("../models/CbtAttempt.model");
const CbtResponse = require("../models/CbtResponse.model");
const logic = require("../utils/cbtLogic");
const service = require("../utils/cbtService");

const reply = (res, status, body) => res.status(status).json(body);
const ok = (res, data, extra = {}) => reply(res, 200, { success: true, data, ...extra });
const bad = (res, status, message, extra = {}) => reply(res, status, { success: false, message, ...extra });
const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error("[CBT-EXAM]", error);
    bad(res, 500, "Something went wrong. Please try again.");
  }
};

const secret = () => process.env.JWT_SECRET;
const GENERIC_CODE_ERROR = "That exam code is not valid for you. Check it with your teacher.";

// ── Throttle wrong codes (in memory; resets when the server restarts) ─────────
const failures = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const blocked = (actorId) => {
  const row = failures.get(actorId);
  if (!row) return false;
  if (row.resetAt < Date.now()) {
    failures.delete(actorId);
    return false;
  }
  return row.count >= MAX_FAILURES;
};
const noteFailure = (actorId) => {
  const row = failures.get(actorId);
  if (!row || row.resetAt < Date.now()) failures.set(actorId, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else row.count += 1;
};

/** The student's newest sitting on a test (a rewrite adds a new one). */
const latestAttemptOf = (testId, studentId) => CbtAttempt.findOne({ test_id: testId, student_id: studentId }).sort({ attempt_number: -1 });

/** The test this student may open with this code, or null. */
const resolveByCode = async (actor, code) => {
  const normalized = logic.normalizeCode(code);
  if (normalized.length < 8) return null;
  const hash = logic.hashAccessCode(secret(), actor.schoolId, normalized);
  const test = await CbtTest.findOne({ school_id: actor.schoolId, access_code_hash: hash, status: { $in: ["published", "closed"] } });
  if (!test) return null;
  const assignment = await CbtAssignment.findOne({ test_id: test.test_id, student_id: actor.id, status: "assigned" }).lean();
  return assignment ? test : null;
};

const studentTest = (test) => ({
  test_id: test.test_id,
  title: test.title,
  subject_name: test.subject_name,
  class_name: test.class_name,
  instructions: test.instructions,
  duration_minutes: test.duration_minutes,
  question_count: (test.questions || []).length,
  total_marks: test.total_marks,
  opens_at: test.opens_at,
  closes_at: test.closes_at,
});

const attemptView = (attempt) => ({
  attempt_id: attempt.attempt_id,
  status: attempt.status,
  started_at: attempt.started_at,
  allowed_end_at: attempt.allowed_end_at,
  submitted_at: attempt.submitted_at,
});

/** Submit anything whose time has run out so every read sees the real state. */
const settleAttempt = async (test, attempt) => {
  if (attempt && attempt.status === "in_progress") {
    const over = new Date(attempt.allowed_end_at).getTime() <= Date.now();
    if (over || test.status === "closed" || test.status === "archived") {
      return service.finalizeAttempt(test, attempt, over ? "timeout" : "closed");
    }
  }
  return attempt;
};

// ── Access, start ─────────────────────────────────────────────────────────────
const accessExam = wrap(async (req, res) => {
  if (blocked(req.actor.id)) return bad(res, 429, "Too many wrong codes. Please wait a few minutes and try again.", { code: "throttled" });
  const test = await resolveByCode(req.actor, req.body?.code);
  if (!test) {
    noteFailure(req.actor.id);
    return bad(res, 404, GENERIC_CODE_ERROR, { code: "invalid_code" });
  }
  await service.closeDueTests({ test_id: test.test_id });
  const fresh = await CbtTest.findOne({ test_id: test.test_id });
  let attempt = await latestAttemptOf(fresh.test_id, req.actor.id);
  attempt = await settleAttempt(fresh, attempt);

  let state = logic.windowState(fresh);
  if (attempt?.status === "in_progress") state = "in_progress";
  else if (attempt?.status === "submitted") state = "submitted";
  // The teacher starts each student's countdown, so an open test means "wait for your teacher".
  else if (state === "open" || state === "not_open") state = "waiting";
  return ok(res, { test: studentTest(fresh), state, attempt: attempt ? attemptView(attempt) : null, server_now: new Date() });
});

const startExam = wrap(async (req, res) => {
  if (blocked(req.actor.id)) return bad(res, 429, "Too many wrong codes. Please wait a few minutes and try again.", { code: "throttled" });
  const test = await resolveByCode(req.actor, req.body?.code);
  if (!test || test.test_id !== String(req.params.testId)) {
    noteFailure(req.actor.id);
    return bad(res, 404, GENERIC_CODE_ERROR, { code: "invalid_code" });
  }
  await service.closeDueTests({ test_id: test.test_id });
  const fresh = await CbtTest.findOne({ test_id: test.test_id });

  // Students never create their own sitting: the teacher starts it (see startSessions). Entering
  // the code only opens a sitting that already exists and is still running.
  let attempt = await latestAttemptOf(fresh.test_id, req.actor.id);
  attempt = await settleAttempt(fresh, attempt);
  if (attempt?.status === "submitted") {
    return bad(res, 409, "You have already submitted this test.", { code: "already_submitted" });
  }
  if (!attempt) {
    if (fresh.status === "closed") return bad(res, 409, "This test is closed.", { code: "closed" });
    return bad(res, 409, "Your teacher has not started your test yet. Stay on this page.", { code: "waiting" });
  }

  return ok(res, await examPayload(fresh, attempt));
});

const examPayload = async (test, attempt) => {
  const responses = await CbtResponse.find({ attempt_id: attempt.attempt_id }).select("question_id answer flagged").lean();
  return {
    test: studentTest(test),
    attempt: attemptView(attempt),
    questions: (test.questions || []).map(logic.studentQuestion),
    responses: responses.map((row) => ({ question_id: row.question_id, answer: row.answer, flagged: row.flagged })),
    server_now: new Date(),
  };
};

/** Pick an attempt back up after a refresh. The student owns the attempt, so no code is needed. */
const resumeExam = wrap(async (req, res) => {
  const { attempt, test } = await ownAttempt(req);
  if (!attempt || !test) return bad(res, 404, "Attempt not found.");
  const settled = await settleAttempt(test, attempt);
  if (settled.status !== "in_progress") return bad(res, 409, "This test has already been submitted.", { code: "already_submitted" });
  return ok(res, await examPayload(test, settled));
});

// ── Answers, submit ───────────────────────────────────────────────────────────
const ownAttempt = async (req) => {
  const attempt = await CbtAttempt.findOne({ attempt_id: String(req.params.attemptId), student_id: req.actor.id, school_id: req.actor.schoolId });
  if (!attempt) return {};
  const test = await CbtTest.findOne({ test_id: attempt.test_id, school_id: req.actor.schoolId });
  return { attempt, test };
};

/** Store answers that arrived in time. Returns an error message for the first invalid one. */
const storeAnswers = async (test, attempt, answers) => {
  if (!Array.isArray(answers) || answers.length > 300) return "Too many answers in one request.";
  const questionMap = new Map((test.questions || []).map((question) => [question.question_id, question]));
  const writes = [];
  const now = new Date();
  for (const item of answers) {
    const question = questionMap.get(String(item?.question_id));
    if (!question) return "One of the answers does not belong to this test.";
    const set = {};
    if (item.answer !== undefined) {
      const answer = String(item.answer ?? "");
      if (question.type === "short") {
        if (answer.length > logic.MAX_ANSWER) return `Answers can be up to ${logic.MAX_ANSWER} characters.`;
      } else if (answer !== "" && !(question.options || []).some((option) => option.id === answer)) {
        return "That option does not exist for this question.";
      }
      set.answer = answer;
      set.answered_at = answer ? now : null;
    }
    if (item.flagged !== undefined) set.flagged = Boolean(item.flagged);
    if (Object.keys(set).length === 0) continue;
    writes.push({
      updateOne: {
        filter: { attempt_id: attempt.attempt_id, question_id: question.question_id },
        update: {
          $set: set,
          $setOnInsert: { test_id: test.test_id, school_id: test.school_id, student_id: attempt.student_id },
        },
        upsert: true,
      },
    });
  }
  if (writes.length) await CbtResponse.bulkWrite(writes, { ordered: false });
  return null;
};

const timedOut = (res, test, attempt) =>
  service.finalizeAttempt(test, attempt, "timeout").then(() => bad(res, 409, "Time is up. Your answers have been submitted.", { code: "expired" }));

const saveAnswers = wrap(async (req, res) => {
  const { attempt, test } = await ownAttempt(req);
  if (!attempt || !test) return bad(res, 404, "Attempt not found.");
  if (attempt.status !== "in_progress") return bad(res, 409, "This test has already been submitted.", { code: "submitted" });
  if (new Date(attempt.allowed_end_at).getTime() <= Date.now()) return timedOut(res, test, attempt);
  if (test.status === "closed" || test.status === "archived") {
    await service.finalizeAttempt(test, attempt, "closed");
    return bad(res, 409, "This test has been closed. Your answers have been submitted.", { code: "closed" });
  }
  const problem = await storeAnswers(test, attempt, req.body?.answers);
  if (problem) return bad(res, 422, problem);
  return ok(res, { saved_at: new Date(), allowed_end_at: attempt.allowed_end_at });
});

const submitExam = wrap(async (req, res) => {
  const { attempt, test } = await ownAttempt(req);
  if (!attempt || !test) return bad(res, 404, "Attempt not found.");
  if (attempt.status === "submitted") {
    return ok(res, { status: "submitted", submitted_at: attempt.submitted_at, already_submitted: true });
  }
  const inTime = new Date(attempt.allowed_end_at).getTime() > Date.now() && test.status !== "closed" && test.status !== "archived";
  if (inTime && Array.isArray(req.body?.answers) && req.body.answers.length) {
    const problem = await storeAnswers(test, attempt, req.body.answers);
    if (problem) return bad(res, 422, problem);
  }
  const done = await service.finalizeAttempt(test, attempt, inTime ? "student" : "timeout");
  return ok(res, { status: "submitted", submitted_at: done.submitted_at, already_submitted: false });
});

// ── Released results ──────────────────────────────────────────────────────────
const listResults = wrap(async (req, res) => {
  const attempts = await CbtAttempt.find({ school_id: req.actor.schoolId, student_id: req.actor.id, release_status: "released" }).sort({ released_at: -1 }).lean();
  const tests = await CbtTest.find({ test_id: { $in: attempts.map((row) => row.test_id) }, school_id: req.actor.schoolId }).lean();
  const testMap = new Map(tests.map((row) => [row.test_id, row]));
  const subsessionId = req.query.subsession_id ? String(req.query.subsession_id) : null;
  const rows = attempts
    .map((attempt) => ({ attempt, test: testMap.get(attempt.test_id) }))
    .filter((row) => row.test && (!subsessionId || row.test.subsession_id === subsessionId))
    .map(({ attempt, test }) => ({
      attempt_id: attempt.attempt_id,
      title: test.title,
      subject_name: test.subject_name,
      subsession_id: test.subsession_id,
      assessment: test.grading_field,
      marks_earned: attempt.marks_earned,
      marks_possible: attempt.marks_possible,
      percentage: attempt.percentage,
      normalized_score: attempt.normalized_score,
      normalized_max: attempt.normalized_max,
      released_at: attempt.released_at,
    }));
  return ok(res, rows);
});

const getResult = wrap(async (req, res) => {
  const attempt = await CbtAttempt.findOne({
    attempt_id: String(req.params.attemptId),
    student_id: req.actor.id,
    school_id: req.actor.schoolId,
    release_status: "released",
  }).lean();
  if (!attempt) return bad(res, 404, "Result not found.");
  const test = await CbtTest.findOne({ test_id: attempt.test_id, school_id: req.actor.schoolId }).lean();
  if (!test) return bad(res, 404, "Result not found.");
  const responses = await CbtResponse.find({ attempt_id: attempt.attempt_id }).lean();
  const byQuestion = new Map(responses.map((row) => [row.question_id, row]));
  return ok(res, {
    test: { title: test.title, subject_name: test.subject_name, assessment: test.grading_field },
    summary: {
      marks_earned: attempt.marks_earned,
      marks_possible: attempt.marks_possible,
      percentage: attempt.percentage,
      normalized_score: attempt.normalized_score,
      normalized_max: attempt.normalized_max,
      released_at: attempt.released_at,
    },
    items: (test.questions || []).map((question, index) => {
      const response = byQuestion.get(question.question_id);
      const objective = question.type !== "short";
      return {
        number: index + 1,
        type: question.type,
        prompt: question.prompt,
        options: (question.options || []).map((item) => ({ id: item.id, text: item.text })),
        marks: question.marks,
        answer: response?.answer || "",
        awarded_marks: response?.awarded_marks ?? 0,
        // The key is only shown for questions a computer marked, once results are released.
        correct_option_id: objective ? question.correct_option_id : null,
        feedback: response?.feedback || "",
        explanation: test.release_explanations ? question.explanation || "" : "",
      };
    }),
  });
});

module.exports = { accessExam, startExam, resumeExam, saveAnswers, submitExam, listResults, getResult };
