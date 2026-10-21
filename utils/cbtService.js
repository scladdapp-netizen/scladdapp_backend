/**
 * CBT domain operations shared by the staff and student controllers:
 * grading, attempt finalisation, score-sheet sync and the audit trail.
 */
const CbtTest = require("../models/CbtTest.model");
const CbtAttempt = require("../models/CbtAttempt.model");
const CbtResponse = require("../models/CbtResponse.model");
const CbtAudit = require("../models/CbtAudit.model");
const StudentScore = require("../models/StudentScore.model");
const Subject = require("../models/Subject.model");
const Subsession = require("../models/Subsession.model");
const CombinedTemplate = require("../models/CombinedTemplate.model");
const logic = require("./cbtLogic");

const lazyGenerateReport = () => require("../controllers/student_report.controller").generateReport;

// ── Audit ─────────────────────────────────────────────────────────────────────
const audit = async (actor, test, action, extra = {}) => {
  try {
    await CbtAudit.create({
      audit_id: logic.makeId("aud"),
      school_id: test.school_id,
      test_id: test.test_id,
      attempt_id: extra.attempt_id || null,
      question_id: extra.question_id || null,
      student_id: extra.student_id || null,
      action,
      actor_id: actor?.id || null,
      actor_role: actor?.role === "student" ? "student" : actor ? (actor.admin ? "admin" : "teacher") : "system",
      previous: extra.previous ?? null,
      next: extra.next ?? null,
      reason: extra.reason || "",
    });
  } catch (error) {
    console.error("[CBT-AUDIT]", error.message);
  }
};

// ── Grading template ──────────────────────────────────────────────────────────
const termContext = async (schoolId, subsessionId) => {
  const subsession = await Subsession.findOne({ term_id: String(subsessionId), school_id: schoolId }).lean();
  if (!subsession) return null;
  let fields = [];
  if (subsession.grading_template_id) {
    const template = await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean();
    fields = (template?.grading_fields || [])
      .map((item) => ({ field_name: String(item.field_name), max_score: Number(item.max_score) }))
      .filter((item) => item.field_name && Number.isFinite(item.max_score));
  }
  return { subsession, fields };
};

const fieldMaxOf = (fields, name) => {
  const hit = fields.find((item) => item.field_name === name);
  return hit && hit.max_score > 0 ? hit.max_score : null;
};

// ── Grading ───────────────────────────────────────────────────────────────────
const orderedQuestionMap = (test) => new Map((test.questions || []).map((question) => [question.question_id, question]));

/** Make sure every question has a response row, then auto-mark what a computer can mark. */
const autoGradeAttempt = async (test, attempt) => {
  const questions = test.questions || [];
  if (questions.length) {
    await CbtResponse.bulkWrite(
      questions.map((question) => ({
        updateOne: {
          filter: { attempt_id: attempt.attempt_id, question_id: question.question_id },
          update: {
            $setOnInsert: {
              test_id: test.test_id,
              school_id: test.school_id,
              student_id: attempt.student_id,
              answer: "",
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  const responses = await CbtResponse.find({ attempt_id: attempt.attempt_id }).lean();
  const byQuestion = orderedQuestionMap(test);
  const writes = [];
  for (const response of responses) {
    const question = byQuestion.get(response.question_id);
    if (!question || response.grading_source) continue;
    let marks = logic.gradeObjective(question, response.answer);
    // A blank short answer needs no human: it earns nothing.
    if (marks === null && !String(response.answer || "").trim()) marks = 0;
    if (marks === null) continue;
    writes.push({
      updateOne: {
        filter: { _id: response._id, grading_source: null },
        update: { $set: { awarded_marks: marks, grading_source: "auto", graded_at: new Date() } },
      },
    });
  }
  if (writes.length) await CbtResponse.bulkWrite(writes, { ordered: false });
  return recomputeAttempt(test, attempt.attempt_id, { markAutoGraded: true });
};

/** Re-add every question's awarded marks into the attempt totals. Safe to run repeatedly. */
const recomputeAttempt = async (test, attemptId, options = {}) => {
  const responses = await CbtResponse.find({ attempt_id: attemptId }).lean();
  const byQuestion = orderedQuestionMap(test);
  let pending = false;
  const objective = [];
  const manual = [];
  for (const question of test.questions || []) {
    const response = responses.find((item) => item.question_id === question.question_id);
    const awarded = response && response.awarded_marks !== null && response.awarded_marks !== undefined ? Number(response.awarded_marks) : null;
    if (awarded === null) {
      pending = true;
      continue;
    }
    (byQuestion.get(question.question_id)?.type === "short" ? manual : objective).push(awarded);
  }
  const possible = Number(test.total_marks) || logic.totalMarksOf(test.questions);
  const objectiveMarks = logic.sumMarks(objective);
  const manualMarks = logic.sumMarks(manual);
  const earned = logic.sumMarks([objectiveMarks, manualMarks]);
  const normalizedMax = Number(test.assessment_max) || null;
  const set = {
    objective_marks: objectiveMarks,
    manual_marks: manualMarks,
    marks_earned: earned,
    marks_possible: possible,
    percentage: logic.percentageOf(earned, possible),
    normalized_max: normalizedMax,
    normalized_score: normalizedMax ? logic.normalizeScore(earned, possible, normalizedMax) : null,
    grading_status: pending ? "pending_manual" : "graded",
  };
  if (options.markAutoGraded) set.auto_graded_at = new Date();
  return CbtAttempt.findOneAndUpdate({ attempt_id: attemptId }, { $set: set }, { returnDocument: "after" });
};

/** Finalise an attempt exactly once. Concurrent callers all get the same stored result. */
const finalizeAttempt = async (test, attempt, reason, now = new Date()) => {
  if (attempt.status !== "in_progress") return attempt;
  const claimed = await CbtAttempt.findOneAndUpdate(
    { attempt_id: attempt.attempt_id, status: "in_progress" },
    { $set: { status: "submitted", submitted_at: now, submit_reason: reason } },
    { returnDocument: "after" }
  );
  if (!claimed) return CbtAttempt.findOne({ attempt_id: attempt.attempt_id });
  const graded = await autoGradeAttempt(test, claimed);
  if (graded?.grading_status === "graded") {
    try {
      await writeScore(test, graded);
    } catch (error) {
      console.error("[CBT] score sync failed:", error.message);
    }
  }
  return graded;
};

/** Close out attempts whose time has run out and finish any half-done grading. */
const settleTest = async (test, now = new Date()) => {
  const stale = await CbtAttempt.find({ test_id: test.test_id, status: "in_progress", allowed_end_at: { $lte: now } });
  for (const attempt of stale) {
    await finalizeAttempt(test, attempt, test.status === "closed" ? "closed" : "timeout", now);
  }
  const ungraded = await CbtAttempt.find({ test_id: test.test_id, status: "submitted", auto_graded_at: null });
  for (const attempt of ungraded) await autoGradeAttempt(test, attempt);
};

/** Move published tests past their closing time to "closed". */
const closeDueTests = async (filter = {}, now = new Date()) => {
  await CbtTest.updateMany(
    { ...filter, status: "published", closes_at: { $lte: now } },
    [{ $set: { status: "closed", closed_at: "$closes_at" } }],
    { updatePipeline: true }
  );
};

const sweepExpired = async () => {
  const now = new Date();
  await closeDueTests({}, now);
  const stale = await CbtAttempt.find({ status: "in_progress", allowed_end_at: { $lte: now } }).limit(500);
  const tests = new Map();
  for (const attempt of stale) {
    if (!tests.has(attempt.test_id)) tests.set(attempt.test_id, await CbtTest.findOne({ test_id: attempt.test_id }));
    const test = tests.get(attempt.test_id);
    if (test) await finalizeAttempt(test, attempt, test.status === "closed" ? "closed" : "timeout", now);
  }
};

// ── Score sheet ───────────────────────────────────────────────────────────────
const safeFieldName = (name) => Boolean(name) && !String(name).includes(".") && !String(name).startsWith("$");

/**
 * Write the normalised result into the subject score sheet. Setting the same value again changes
 * nothing, and a different value replaces the previous one instead of adding a second entry.
 */
const syncScoreSheet = async (test, attempt) => {
  if (!safeFieldName(test.grading_field)) throw new Error("This assessment name cannot be written to the score sheet.");
  const value = attempt.normalized_score;
  if (value === null || value === undefined || !Number.isFinite(Number(value))) throw new Error("No score to write.");
  const filter = {
    school_id: test.school_id,
    student_id: attempt.student_id,
    subsession_id: test.subsession_id,
    subject_id: test.subject_id,
  };
  const existing = await StudentScore.findOne(filter).lean();
  const previous = existing?.scores?.[test.grading_field];
  const subsession = await Subsession.findOne({ term_id: test.subsession_id, school_id: test.school_id }).lean();
  const subject = await Subject.findOne({ subject_id: test.subject_id, school_id: test.school_id }).lean();
  await StudentScore.updateOne(
    filter,
    {
      $set: { [`scores.${test.grading_field}`]: Number(value), updated_at: new Date() },
      $setOnInsert: {
        score_id: `SCORE-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        student_name: attempt.student_name || "",
        session_id: subsession?.session_id || test.session_id || null,
        class_id: test.class_id,
        subject_name: subject?.subject_name || test.subject_name,
        grading_template_id: subsession?.grading_template_id ?? null,
        entered_by: "cbt",
        entered_at: new Date(),
      },
    },
    { upsert: true }
  );
  try {
    await lazyGenerateReport()(attempt.student_id, test.subsession_id);
  } catch (error) {
    console.error("[CBT] report refresh failed:", error.message);
  }
  return { value: Number(value), previous: previous === undefined ? null : Number(previous) };
};

/** Put a finished mark on the assessment sheet. A later mark replaces the earlier one. */
const writeScore = async (test, attempt) => {
  if (!attempt || attempt.grading_status !== "graded") return null;
  try {
    const synced = await syncScoreSheet(test, attempt);
    await CbtAttempt.updateOne(
      { attempt_id: attempt.attempt_id },
      { $set: { synced_value: synced.value, score_sync_status: "synced", score_sync_error: null } }
    );
    return synced;
  } catch (error) {
    await CbtAttempt.updateOne(
      { attempt_id: attempt.attempt_id },
      { $set: { score_sync_status: "failed", score_sync_error: error.message } }
    );
    throw error;
  }
};

/** Write graded CBT marks that have not reached the assessment sheet yet. */
const syncPendingScores = async (subjectId, subsessionId) => {
  const tests = await CbtTest.find({
    subject_id: subjectId,
    subsession_id: subsessionId,
    status: { $ne: "archived" },
    grading_field: { $nin: ["", null] },
  }).lean();
  for (const test of tests) {
    const attempts = await CbtAttempt.find({
      test_id: test.test_id,
      status: "submitted",
      grading_status: "graded",
      score_sync_status: { $ne: "synced" },
    });
    for (const attempt of attempts) {
      try {
        await writeScore(test, attempt);
      } catch (error) {
        console.error("[CBT] score sync failed:", error.message);
      }
    }
  }
};

module.exports = {
  audit,
  termContext,
  fieldMaxOf,
  autoGradeAttempt,
  recomputeAttempt,
  finalizeAttempt,
  settleTest,
  closeDueTests,
  sweepExpired,
  safeFieldName,
  syncScoreSheet,
  writeScore,
  syncPendingScores,
};
