/**
 * Pure CBT rules: validation, grading, score normalisation, deadlines and exam-code helpers.
 * Nothing in here touches the database, so it can be unit tested on its own.
 */
const crypto = require("crypto");

const QUESTION_TYPES = ["mcq", "truefalse", "short"];
const MAX_QUESTION_MARKS = 1000;
const MAX_PROMPT = 4000;
const MAX_ANSWER = 5000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// ── Marks arithmetic (hundredths, so 0.1 + 0.2 never drifts) ──────────────────
const toHundredths = (value) => Math.round(Number(value) * 100);
const fromHundredths = (value) => Math.round(value) / 100;
const round2 = (value) => fromHundredths(toHundredths(value));
const sumMarks = (values) => fromHundredths(values.reduce((sum, value) => sum + toHundredths(value || 0), 0));

const hasAtMostTwoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

// ── Question helpers ──────────────────────────────────────────────────────────
const TRUE_FALSE_OPTIONS = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];

const makeId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;

/** Normalise a question coming from the browser into the stored shape. Never throws. */
const cleanQuestion = (raw) => {
  const type = QUESTION_TYPES.includes(raw?.type) ? raw.type : "mcq";
  let options = [];
  if (type === "truefalse") {
    options = TRUE_FALSE_OPTIONS.map((item) => ({ ...item }));
  } else if (type === "mcq") {
    const source = Array.isArray(raw?.options) ? raw.options : [];
    const seen = new Set();
    options = source.slice(0, 10).map((item, index) => {
      let id = String(item?.id || "").trim() || makeId(`o${index}`);
      if (seen.has(id)) id = makeId(`o${index}`);
      seen.add(id);
      return { id, text: String(item?.text ?? item ?? "").slice(0, 1000) };
    });
  }
  let correct = type === "short" ? "" : String(raw?.correct_option_id || "").trim();
  if (correct && !options.some((item) => item.id === correct)) correct = "";
  const marksNumber = Number(raw?.marks);
  return {
    question_id: String(raw?.question_id || "").trim() || makeId("q"),
    type,
    prompt: String(raw?.prompt || "").slice(0, MAX_PROMPT),
    options,
    correct_option_id: correct,
    marks: Number.isFinite(marksNumber) ? marksNumber : 0,
    explanation: String(raw?.explanation || "").slice(0, 2000),
    expected_answer: type === "short" ? String(raw?.expected_answer || "").slice(0, 2000) : "",
    marking_guide: type === "short" ? String(raw?.marking_guide || "").slice(0, 2000) : "",
    grading_notes: type === "short" ? String(raw?.grading_notes || "").slice(0, 2000) : "",
  };
};

/** Problems that must block even a draft save (they would corrupt grading later). */
const draftProblems = (questions) => {
  const problems = [];
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!Number.isFinite(question.marks) || question.marks < 0) {
      problems.push({ question_id: question.question_id, field: "marks", message: `${label}: marks must be zero or more.` });
    } else if (question.marks > MAX_QUESTION_MARKS) {
      problems.push({ question_id: question.question_id, field: "marks", message: `${label}: marks cannot exceed ${MAX_QUESTION_MARKS}.` });
    } else if (!hasAtMostTwoDecimals(question.marks)) {
      problems.push({ question_id: question.question_id, field: "marks", message: `${label}: marks can have at most two decimal places.` });
    }
  });
  return problems;
};

/** Everything that must be true before a test can be published. */
const publishProblems = (test, assessmentMax) => {
  const problems = [];
  const add = (field, message, question_id = null) => problems.push({ field, message, question_id });
  if (!String(test.title || "").trim()) add("title", "Add a title.");
  if (!String(test.instructions || "").trim()) add("instructions", "Add instructions for students.");
  if (!test.class_id) add("class_id", "Choose a class.");
  const duration = Number(test.duration_minutes);
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) add("duration_minutes", "Set a duration between 1 and 600 minutes.");
  if (!test.grading_field) add("grading_field", "Choose which report assessment this test feeds.");
  else if (!(Number(assessmentMax) > 0)) add("grading_field", "The chosen assessment has no maximum score in the grading template.");
  const questions = test.questions || [];
  if (questions.length === 0) add("questions", "Add at least one question.");
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!String(question.prompt || "").trim()) add("prompt", `${label}: add the question text.`, question.question_id);
    if (!(Number(question.marks) > 0)) add("marks", `${label}: marks must be greater than zero.`, question.question_id);
    if (question.type === "mcq") {
      const filled = (question.options || []).filter((item) => String(item.text || "").trim());
      if (filled.length < 2) add("options", `${label}: add at least two options.`, question.question_id);
      if ((question.options || []).some((item) => !String(item.text || "").trim())) add("options", `${label}: fill in or remove empty options.`, question.question_id);
      const texts = filled.map((item) => String(item.text).trim().toLowerCase());
      if (new Set(texts).size !== texts.length) add("options", `${label}: options must be different from each other.`, question.question_id);
    }
    if (question.type === "mcq" || question.type === "truefalse") {
      if (!question.correct_option_id) add("correct_option_id", `${label}: choose the correct answer.`, question.question_id);
    }
  });
  // The questions must add up to the assessment's maximum so the score can go straight onto the sheet.
  if (questions.length && Number(assessmentMax) > 0) {
    const total = totalMarksOf(questions);
    if (toHundredths(total) !== toHundredths(assessmentMax)) {
      add("marks", `Question marks add up to ${total} but must equal ${assessmentMax}.`);
    }
  }
  return problems.concat(draftProblems(questions));
};

const totalMarksOf = (questions) => sumMarks((questions || []).map((question) => Number(question.marks) || 0));

// ── Grading ───────────────────────────────────────────────────────────────────
/** Marks for one objective response, or null when the question needs a human. */
const gradeObjective = (question, answer) => {
  if (question.type === "short") return null;
  const marks = Number(question.marks) || 0;
  return String(answer ?? "") !== "" && String(answer) === String(question.correct_option_id) ? marks : 0;
};

const clampAwarded = (value, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0 || number > Number(max)) return null;
  if (!hasAtMostTwoDecimals(number)) return null;
  return round2(number);
};

/** (earned / possible) x assessment max, rounded to two decimals. */
const normalizeScore = (earned, possible, assessmentMax) => {
  if (!(Number(possible) > 0) || !(Number(assessmentMax) > 0)) return 0;
  const raw = (toHundredths(earned) * Number(assessmentMax)) / toHundredths(possible);
  return round2(raw);
};

const percentageOf = (earned, possible) => (Number(possible) > 0 ? round2((Number(earned) / Number(possible)) * 100) : 0);

// ── Deadlines ─────────────────────────────────────────────────────────────────
const effectiveClose = (test) => (test.closes_at ? new Date(test.closes_at) : null);

/** The earlier of "start + duration" and the closing time. */
const attemptDeadline = (startedAt, durationMinutes, closeAt) => {
  const byDuration = new Date(new Date(startedAt).getTime() + Number(durationMinutes) * 60000);
  if (!closeAt) return byDuration;
  return byDuration.getTime() <= new Date(closeAt).getTime() ? byDuration : new Date(closeAt);
};

/** Why a student can or cannot begin right now. */
const windowState = (test, now = new Date()) => {
  if (test.status === "draft") return "unavailable";
  if (test.status === "archived") return "unavailable";
  if (test.status === "closed") return "closed";
  const close = effectiveClose(test);
  if (close && now.getTime() >= close.getTime()) return "closed";
  if (test.opens_at && now.getTime() < new Date(test.opens_at).getTime()) return "not_open";
  return "open";
};

// ── Exam access code ──────────────────────────────────────────────────────────
const normalizeCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Deterministic per test and version, so teachers can re-read it without storing it in clear. */
const deriveAccessCode = (secret, testId, version) => {
  const digest = crypto.createHmac("sha256", String(secret)).update(`cbt-code:${testId}:${version}`).digest();
  let out = "";
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
};

const hashAccessCode = (secret, schoolId, code) =>
  crypto.createHmac("sha256", String(secret)).update(`cbt-hash:${schoolId}:${normalizeCode(code)}`).digest("hex");

/** Three characters, like "pa1" or "edd". The pair is the student's exam link. */
const linkCode = () => {
  const bytes = crypto.randomBytes(3);
  let out = "";
  for (let i = 0; i < 3; i += 1) out += LINK_ALPHABET[bytes[i] % LINK_ALPHABET.length];
  return out;
};

const normalizeLinkCode = (value) => {
  const code = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return code.length === 3 ? code : "";
};

// ── Student-safe views ────────────────────────────────────────────────────────
const studentQuestion = (question) => ({
  question_id: question.question_id,
  type: question.type,
  prompt: question.prompt,
  options: (question.options || []).map((item) => ({ id: item.id, text: item.text })),
  marks: question.marks,
});

const attemptDisplayStatus = (attempt) => {
  if (!attempt) return "not_started";
  if (attempt.release_status === "released") return "released";
  if (attempt.status === "in_progress") return "in_progress";
  if (attempt.grading_status === "graded") return "graded";
  return "awaiting_marking";
};

// ── Sittings: several attempts per student (a rewrite adds one) ───────────────
const byNumber = (a, b) => (a.attempt_number || 1) - (b.attempt_number || 1);

const latestAttempt = (attempts) => [...(attempts || [])].sort(byNumber).pop() || null;

/**
 * The attempt whose score counts: the one the teacher picked, otherwise the latest submitted
 * attempt, otherwise the latest attempt (still being written).
 */
const countedAttempt = (attempts, pickedId = null) => {
  const list = attempts || [];
  const picked = pickedId ? list.find((item) => item.attempt_id === pickedId && item.status === "submitted") : null;
  if (picked) return picked;
  const submitted = list.filter((item) => item.status === "submitted").sort(byNumber);
  return submitted.pop() || latestAttempt(list);
};

/** One word for where a student is: absent, not started, writing, or the state of their counted attempt. */
const sittingState = (assignment, attempts) => {
  if (!attempts || attempts.length === 0) return assignment?.absent ? "absent" : "not_started";
  if (attempts.some((item) => item.status === "in_progress")) return "in_progress";
  return attemptDisplayStatus(countedAttempt(attempts, assignment?.counted_attempt_id));
};

/** Why the teacher cannot start this student right now, or "" when they can. */
const startProblem = (kind, attempts, counted) => {
  const list = attempts || [];
  if (list.some((item) => item.status === "in_progress")) return "Already writing.";
  if (kind === "start" && list.length > 0) return "Already wrote this test. Use Allow rewrite.";
  if (kind === "rewrite") {
    if (list.length === 0) return "Has not written the test yet. Use Start.";
    if (counted && counted.release_status === "released") return "Results are already released for this student.";
  }
  return "";
};

module.exports = {
  latestAttempt,
  countedAttempt,
  sittingState,
  startProblem,
  QUESTION_TYPES,
  MAX_QUESTION_MARKS,
  MAX_ANSWER,
  TRUE_FALSE_OPTIONS,
  toHundredths,
  fromHundredths,
  round2,
  sumMarks,
  hasAtMostTwoDecimals,
  makeId,
  cleanQuestion,
  draftProblems,
  publishProblems,
  totalMarksOf,
  gradeObjective,
  clampAwarded,
  normalizeScore,
  percentageOf,
  effectiveClose,
  attemptDeadline,
  windowState,
  normalizeCode,
  deriveAccessCode,
  hashAccessCode,
  linkCode,
  normalizeLinkCode,
  studentQuestion,
  attemptDisplayStatus,
};
