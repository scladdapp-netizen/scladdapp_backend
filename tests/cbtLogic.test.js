const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../utils/cbtLogic");

const mcq = (over = {}) =>
  logic.cleanQuestion({
    question_id: "q1",
    type: "mcq",
    prompt: "2 + 2?",
    marks: 2,
    options: [
      { id: "a", text: "3" },
      { id: "b", text: "4" },
    ],
    correct_option_id: "b",
    ...over,
  });

const readyTest = (over = {}) => ({
  title: "CA 1",
  instructions: "Answer all",
  class_id: "c1",
  duration_minutes: 30,
  grading_field: "CA",
  questions: [mcq({ marks: 20 })],
  ...over,
});

test("exam link codes are three short characters", () => {
  const code = logic.linkCode();
  assert.equal(code.length, 3);
  assert.match(code, /^[a-z0-9]{3}$/);
  assert.equal(logic.normalizeLinkCode(code), code);
  assert.equal(logic.normalizeLinkCode("PA1"), "pa1");
  assert.equal(logic.normalizeLinkCode("ab"), "");
  assert.equal(logic.normalizeLinkCode("abcd"), "");
});

test("a complete test has no publish problems", () => {
  assert.deepEqual(logic.publishProblems(readyTest(), 20), []);
});

test("question marks must add up to the assessment maximum", () => {
  const under = logic.publishProblems(readyTest({ questions: [mcq({ marks: 15 })] }), 20);
  assert.ok(under.some((p) => p.field === "marks" && /must equal 20/.test(p.message)));
  const over = logic.publishProblems(readyTest({ questions: [mcq({ marks: 15 }), mcq({ question_id: "q2", marks: 10 })] }), 20);
  assert.ok(over.some((p) => /add up to 25/.test(p.message)));
  const split = logic.publishProblems(readyTest({ questions: [mcq({ marks: 12.5 }), mcq({ question_id: "q2", marks: 7.5 })] }), 20);
  assert.deepEqual(split, []);
});

test("publishing is blocked until every required piece exists", () => {
  const fields = logic.publishProblems(readyTest({ title: "", instructions: "", class_id: null, duration_minutes: 0, grading_field: "", questions: [] }), null).map((p) => p.field);
  for (const expected of ["title", "instructions", "class_id", "duration_minutes", "grading_field", "questions"]) {
    assert.ok(fields.includes(expected), `missing ${expected}`);
  }
});

test("each question is checked for text, marks, options and a correct answer", () => {
  const broken = [
    mcq({ question_id: "a", prompt: "" }),
    mcq({ question_id: "b", marks: 0 }),
    mcq({ question_id: "c", options: [{ id: "a", text: "only" }] }),
    mcq({ question_id: "d", correct_option_id: "" }),
    mcq({ question_id: "e", options: [{ id: "a", text: "same" }, { id: "b", text: "Same" }], correct_option_id: "a" }),
  ];
  const problems = logic.publishProblems(readyTest({ questions: broken }), 20);
  const ids = new Set(problems.map((p) => p.question_id));
  for (const id of ["a", "b", "c", "d", "e"]) assert.ok(ids.has(id), `question ${id} should be flagged`);
});

test("a correct answer that is not one of the options is dropped", () => {
  assert.equal(mcq({ correct_option_id: "zzz" }).correct_option_id, "");
});

test("draft saving only rejects invalid marks", () => {
  const draft = [logic.cleanQuestion({ type: "mcq", prompt: "", marks: -1 }), logic.cleanQuestion({ type: "short", marks: 1.234 }), logic.cleanQuestion({ type: "short", marks: 1.25 })];
  const problems = logic.draftProblems(draft);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => p.field === "marks"));
});

test("true/false questions always carry the fixed options", () => {
  const question = logic.cleanQuestion({ type: "truefalse", prompt: "x", marks: 1, correct_option_id: "true", options: [{ id: "q", text: "Maybe" }] });
  assert.deepEqual(question.options.map((o) => o.id), ["true", "false"]);
  assert.equal(question.correct_option_id, "true");
});

test("objective grading awards full marks only for the exact option", () => {
  const question = mcq({ marks: 2.5 });
  assert.equal(logic.gradeObjective(question, "b"), 2.5);
  assert.equal(logic.gradeObjective(question, "a"), 0);
  assert.equal(logic.gradeObjective(question, ""), 0);
  assert.equal(logic.gradeObjective(logic.cleanQuestion({ type: "short", marks: 3 }), "anything"), null);
});

test("manual marks must stay within 0..max with two decimals", () => {
  assert.equal(logic.clampAwarded("1.5", 2), 1.5);
  assert.equal(logic.clampAwarded(0, 2), 0);
  assert.equal(logic.clampAwarded(2, 2), 2);
  assert.equal(logic.clampAwarded(2.01, 2), null);
  assert.equal(logic.clampAwarded(-1, 2), null);
  assert.equal(logic.clampAwarded("abc", 2), null);
  assert.equal(logic.clampAwarded(1.234, 2), null);
});

test("marks add up without floating point drift", () => {
  assert.equal(logic.sumMarks([0.1, 0.2]), 0.3);
  assert.equal(logic.totalMarksOf([{ marks: 0.1 }, { marks: 0.2 }, { marks: 0.7 }]), 1);
});

test("scores are scaled to the assessment maximum", () => {
  assert.equal(logic.normalizeScore(15, 30, 20), 10);
  assert.equal(logic.normalizeScore(7, 9, 20), 15.56);
  assert.equal(logic.normalizeScore(0, 30, 20), 0);
  assert.equal(logic.normalizeScore(30, 30, 20), 20);
  assert.equal(logic.normalizeScore(5, 0, 20), 0);
  assert.equal(logic.percentageOf(7, 9), 77.78);
});

test("the attempt ends at the earlier of duration and closing time", () => {
  const start = new Date("2026-01-01T10:00:00Z");
  assert.equal(logic.attemptDeadline(start, 30, new Date("2026-01-01T12:00:00Z")).toISOString(), "2026-01-01T10:30:00.000Z");
  assert.equal(logic.attemptDeadline(start, 30, new Date("2026-01-01T10:10:00Z")).toISOString(), "2026-01-01T10:10:00.000Z");
  assert.equal(logic.attemptDeadline(start, 30, null).toISOString(), "2026-01-01T10:30:00.000Z");
});

test("the test window follows status, opening and closing time", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  const base = { status: "published", opens_at: null, closes_at: new Date("2026-01-01T12:00:00Z") };
  assert.equal(logic.windowState(base, now), "open");
  assert.equal(logic.windowState({ ...base, opens_at: new Date("2026-01-01T11:00:00Z") }, now), "not_open");
  assert.equal(logic.windowState({ ...base, closes_at: new Date("2026-01-01T09:59:00Z") }, now), "closed");
  assert.equal(logic.windowState({ ...base, status: "closed" }, now), "closed");
  assert.equal(logic.windowState({ ...base, status: "draft" }, now), "unavailable");
});

test("exam codes are stable per version, normalised and tied to the school", () => {
  const code = logic.deriveAccessCode("secret", "cbt_1", 1);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(code, logic.deriveAccessCode("secret", "cbt_1", 1));
  assert.notEqual(code, logic.deriveAccessCode("secret", "cbt_1", 2));
  assert.notEqual(code, logic.deriveAccessCode("secret", "cbt_2", 1));
  assert.equal(logic.hashAccessCode("secret", "s1", code), logic.hashAccessCode("secret", "s1", code.toLowerCase().replace("-", " ")));
  assert.notEqual(logic.hashAccessCode("secret", "s1", code), logic.hashAccessCode("secret", "s2", code));
});

test("students never receive answers, guides or notes", () => {
  const short = logic.cleanQuestion({ type: "short", prompt: "Why?", marks: 3, expected_answer: "because", marking_guide: "guide", grading_notes: "secret" });
  const json = JSON.stringify([logic.studentQuestion(mcq()), logic.studentQuestion(short)]);
  for (const leak of ["correct_option_id", "expected_answer", "marking_guide", "grading_notes", "because", "secret"]) {
    assert.ok(!json.includes(leak), `${leak} leaked`);
  }
});

test("attempt status labels", () => {
  assert.equal(logic.attemptDisplayStatus(null), "not_started");
  assert.equal(logic.attemptDisplayStatus({ status: "in_progress" }), "in_progress");
  assert.equal(logic.attemptDisplayStatus({ status: "submitted", grading_status: "pending_manual" }), "awaiting_marking");
  assert.equal(logic.attemptDisplayStatus({ status: "submitted", grading_status: "graded" }), "graded");
  assert.equal(logic.attemptDisplayStatus({ status: "submitted", grading_status: "graded", release_status: "released" }), "released");
});

const sitting = (n, status, extra = {}) => ({ attempt_id: `a${n}`, attempt_number: n, status, grading_status: "graded", release_status: "unreleased", ...extra });

test("the counted attempt is the latest submitted one unless the teacher picked another", () => {
  const list = [sitting(1, "submitted"), sitting(2, "submitted")];
  assert.equal(logic.countedAttempt(list).attempt_id, "a2");
  assert.equal(logic.countedAttempt(list, "a1").attempt_id, "a1");
  // A pick that is not a submitted attempt of this student is ignored.
  assert.equal(logic.countedAttempt(list, "nope").attempt_id, "a2");
  // While a rewrite is being written, the earlier submitted attempt still counts.
  assert.equal(logic.countedAttempt([sitting(1, "submitted"), sitting(2, "in_progress")]).attempt_id, "a1");
  assert.equal(logic.countedAttempt([]), null);
});

test("a student's state follows their sittings", () => {
  assert.equal(logic.sittingState({}, []), "not_started");
  assert.equal(logic.sittingState({ absent: true }, []), "absent");
  assert.equal(logic.sittingState({}, [sitting(1, "in_progress")]), "in_progress");
  assert.equal(logic.sittingState({}, [sitting(1, "submitted"), sitting(2, "in_progress")]), "in_progress");
  assert.equal(logic.sittingState({}, [sitting(1, "submitted", { grading_status: "pending_manual" })]), "awaiting_marking");
  assert.equal(logic.sittingState({}, [sitting(1, "submitted", { release_status: "released" })]), "released");
});

test("who the teacher can start or let rewrite", () => {
  const done = [sitting(1, "submitted")];
  assert.equal(logic.startProblem("start", [], null), "");
  assert.match(logic.startProblem("start", done, done[0]), /Allow rewrite/);
  assert.match(logic.startProblem("start", [sitting(1, "in_progress")], null), /Already writing/);
  assert.equal(logic.startProblem("rewrite", done, done[0]), "");
  assert.match(logic.startProblem("rewrite", [], null), /Use Start/);
  assert.match(logic.startProblem("rewrite", [sitting(1, "in_progress")], null), /Already writing/);
  const released = [sitting(1, "submitted", { release_status: "released" })];
  assert.match(logic.startProblem("rewrite", released, released[0]), /already released/);
});
