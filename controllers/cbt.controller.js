/**
 * CBT staff endpoints (teachers and admins). Every handler runs behind `authenticate` +
 * `requireStaff`; the school and the person come from the signed token only.
 */
const CbtTest = require("../models/CbtTest.model");
const CbtAssignment = require("../models/CbtAssignment.model");
const CbtAttempt = require("../models/CbtAttempt.model");
const CbtResponse = require("../models/CbtResponse.model");
const CbtAudit = require("../models/CbtAudit.model");
const Subject = require("../models/Subject.model");
const Class = require("../models/Class.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const Student = require("../models/Student.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const StudentScore = require("../models/StudentScore.model");
const { checkCbtAccess } = require("../utils/planLimitCheck");
const { adminCan, allowedClassIds, canUseSubject } = require("../middleware/cbtAuth");
const logic = require("../utils/cbtLogic");
const service = require("../utils/cbtService");

const reply = (res, status, body) => res.status(status).json(body);
const ok = (res, data, extra = {}) => reply(res, 200, { success: true, data, ...extra });
const bad = (res, status, message, extra = {}) => reply(res, status, { success: false, message, ...extra });

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error("[CBT]", error);
    bad(res, 500, "Something went wrong. Please try again.");
  }
};

const secret = () => process.env.JWT_SECRET;
const accessCodeOf = (test) =>
  test.status === "published" || test.status === "closed" ? logic.deriveAccessCode(secret(), test.test_id, test.access_code_version || 1) : null;

// ── Loading with tenant + permission checks ───────────────────────────────────
/** Loads a test in the actor's school the actor may work with. Sends the error itself. */
const loadTest = async (req, res, mode = "edit", { allowArchived = false } = {}) => {
  const test = await CbtTest.findOne({ test_id: String(req.params.testId), school_id: req.actor.schoolId });
  if (!test || (test.status === "archived" && !allowArchived)) {
    bad(res, 404, "Test not found.");
    return null;
  }
  if (!(await canUseSubject(req.actor, test.subject_id, test.class_id, mode))) {
    bad(res, 403, "You do not have access to this test.", { code: "forbidden" });
    return null;
  }
  await service.closeDueTests({ test_id: test.test_id });
  return CbtTest.findOne({ test_id: test.test_id });
};

const classStudents = async (test, subsession) => {
  const filter = { school_id: test.school_id, class_id: test.class_id, is_active: true };
  if (subsession?.session_id) filter.session_id = subsession.session_id;
  const rows = await StudentClassAssignment.find(filter).lean();
  const ids = [...new Set(rows.map((row) => row.student_id))];
  const students = await Student.find({ school_id: test.school_id, student_id: { $in: ids }, is_active: true })
    .select("student_id full_name admission_number")
    .lean();
  return students.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
};

/** student_id -> every attempt that student has on the test, oldest first. */
const groupAttempts = (attempts) => {
  const map = new Map();
  for (const attempt of attempts) {
    if (!map.has(attempt.student_id)) map.set(attempt.student_id, []);
    map.get(attempt.student_id).push(attempt);
  }
  for (const list of map.values()) list.sort((a, b) => (a.attempt_number || 1) - (b.attempt_number || 1));
  return map;
};

const staffTest = (test, extra = {}) => {
  const plain = test.toObject ? test.toObject() : test;
  delete plain.access_code_hash;
  return { ...plain, access_code: accessCodeOf(plain), ...extra };
};

// ── Context for the editor ────────────────────────────────────────────────────
const getContext = wrap(async (req, res) => {
  const { subject_id: subjectId, subsession_id: subsessionId } = req.query;
  if (!subjectId || !subsessionId) return bad(res, 400, "Subject and term are required.");
  const subject = await Subject.findOne({ subject_id: String(subjectId), school_id: req.actor.schoolId }).lean();
  if (!subject) return bad(res, 404, "Subject not found.");
  if (!(await canUseSubject(req.actor, subjectId, null, "view"))) return bad(res, 403, "You do not have access to this subject.", { code: "forbidden" });
  const term = await service.termContext(req.actor.schoolId, subsessionId);
  if (!term) return bad(res, 404, "Term not found.");

  const links = await ClassSubjectAssignment.find({ school_id: req.actor.schoolId, subject_id: String(subjectId), is_active: true }).lean();
  let classIds = [...new Set(links.map((row) => row.class_id))];
  const allowed = await allowedClassIds(req.actor, subjectId, "view");
  if (allowed !== null) classIds = classIds.filter((id) => allowed.includes(id));
  const classes = await Class.find({ school_id: req.actor.schoolId, class_id: { $in: classIds }, is_active: true })
    .select("class_id class_name")
    .lean();

  return ok(res, {
    subject: { subject_id: subject.subject_id, subject_name: subject.subject_name },
    term: { term_id: term.subsession.term_id, term_name: term.subsession.term_name, session_id: term.subsession.session_id },
    fields: term.fields.filter((item) => service.safeFieldName(item.field_name)),
    classes,
    can_edit: Boolean((await allowedClassIds(req.actor, subjectId, "edit"))?.length !== 0),
  });
});

// ── List ──────────────────────────────────────────────────────────────────────
const listTests = wrap(async (req, res) => {
  const { subject_id: subjectId, subsession_id: subsessionId } = req.query;
  if (!subjectId || !subsessionId) return bad(res, 400, "Subject and term are required.");
  if (!(await canUseSubject(req.actor, subjectId, null, "view"))) return bad(res, 403, "You do not have access to this subject.", { code: "forbidden" });
  const filter = {
    school_id: req.actor.schoolId,
    subject_id: String(subjectId),
    subsession_id: String(subsessionId),
    status: { $ne: "archived" },
  };
  const allowed = await allowedClassIds(req.actor, subjectId, "view");
  if (allowed !== null) filter.class_id = { $in: allowed };
  const onlyClass = String(req.query.class_id || "");
  if (onlyClass) filter.class_id = allowed !== null && !allowed.includes(onlyClass) ? { $in: [] } : onlyClass;
  await service.closeDueTests(filter);

  // Server-side search and paging for the table.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const field = String(req.query.searchField || "");
    filter.$or = field === "title" || field === "class_name" ? [{ [field]: pattern }] : [{ title: pattern }, { class_name: pattern }];
  }
  const totalRecords = await CbtTest.countDocuments(filter);
  const totalPages = Math.max(Math.ceil(totalRecords / limit), 1);
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages);
  const tests = await CbtTest.find(filter)
    .sort({ created_at: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const ids = tests.map((test) => test.test_id);
  const pagination = {
    currentPage: page,
    totalPages,
    totalRecords,
    recordsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    startIndex: totalRecords ? (page - 1) * limit + 1 : 0,
    endIndex: (page - 1) * limit + tests.length,
  };

  const [assigned, attempts] = await Promise.all([
    CbtAssignment.aggregate([{ $match: { test_id: { $in: ids }, status: "assigned" } }, { $group: { _id: "$test_id", count: { $sum: 1 } } }]),
    CbtAttempt.aggregate([
      { $match: { test_id: { $in: ids } } },
      {
        $group: {
          _id: "$test_id",
          started: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          awaiting: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "submitted"] }, { $ne: ["$grading_status", "graded"] }] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const assignedMap = new Map(assigned.map((row) => [row._id, row.count]));
  const attemptMap = new Map(attempts.map((row) => [row._id, row]));

  return ok(
    res,
    tests.map((test) => {
      const stats = attemptMap.get(test.test_id) || {};
      return {
        test_id: test.test_id,
        title: test.title,
        class_id: test.class_id,
        class_name: test.class_name,
        grading_field: test.grading_field,
        status: test.status,
        question_count: (test.questions || []).length,
        total_marks: test.total_marks,
        duration_minutes: test.duration_minutes,
        opens_at: test.opens_at,
        closes_at: test.closes_at,
        release_state: test.release_state,
        assigned_count: assignedMap.get(test.test_id) || 0,
        started_count: stats.started || 0,
        completed_count: stats.completed || 0,
        awaiting_count: stats.awaiting || 0,
        updated_at: test.updated_at,
      };
    }),
    { pagination }
  );
});

// ── Create / update drafts ────────────────────────────────────────────────────
/** Turn the request body into stored fields, checking the class, assessment and marks. */
const buildDraftFields = async (req, base) => {
  const body = req.body || {};
  const schoolId = req.actor.schoolId;
  const errors = [];
  const fields = {};

  if (body.title !== undefined) fields.title = String(body.title || "").slice(0, 200);
  if (body.instructions !== undefined) fields.instructions = String(body.instructions || "").slice(0, 5000);
  if (body.release_explanations !== undefined) fields.release_explanations = Boolean(body.release_explanations);
  if (body.duration_minutes !== undefined) {
    const raw = body.duration_minutes;
    fields.duration_minutes = raw === "" || raw === null ? null : Number(raw);
    if (fields.duration_minutes !== null && (!Number.isInteger(fields.duration_minutes) || fields.duration_minutes < 1 || fields.duration_minutes > 600)) {
      errors.push({ field: "duration_minutes", message: "Duration must be a whole number between 1 and 600 minutes." });
    }
  }

  const classId = body.class_id !== undefined ? String(body.class_id || "") : base.class_id;
  if (body.class_id !== undefined) {
    if (!classId) {
      fields.class_id = null;
      fields.class_name = "";
    } else {
      const klass = await Class.findOne({ class_id: classId, school_id: schoolId, is_active: true }).lean();
      const linked = klass && (await ClassSubjectAssignment.exists({ school_id: schoolId, subject_id: base.subject_id, class_id: classId, is_active: true }));
      if (!klass || !linked) errors.push({ field: "class_id", message: "That class does not take this subject." });
      else if (!(await canUseSubject(req.actor, base.subject_id, classId, "edit"))) errors.push({ field: "class_id", message: "You are not assigned to teach this subject in that class." });
      else {
        fields.class_id = classId;
        fields.class_name = klass.class_name;
      }
    }
  }

  if (body.grading_field !== undefined) {
    const name = String(body.grading_field || "");
    if (!name) {
      fields.grading_field = "";
      fields.assessment_max = null;
    } else {
      const term = await service.termContext(schoolId, base.subsession_id);
      const max = term ? service.fieldMaxOf(term.fields, name) : null;
      if (!max || !service.safeFieldName(name)) errors.push({ field: "grading_field", message: "That assessment is not part of this term's grading template." });
      else {
        fields.grading_field = name;
        fields.assessment_max = max;
      }
    }
  }

  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions) || body.questions.length > 200) {
      errors.push({ field: "questions", message: "A test can hold up to 200 questions." });
    } else {
      const cleaned = body.questions.map(logic.cleanQuestion);
      const problems = logic.draftProblems(cleaned);
      if (problems.length) errors.push(...problems);
      fields.questions = cleaned;
      fields.total_marks = logic.totalMarksOf(cleaned);
    }
  }
  return { fields, errors };
};

const createTest = wrap(async (req, res) => {
  const { subject_id: subjectId, subsession_id: subsessionId } = req.body || {};
  if (!subjectId || !subsessionId) return bad(res, 400, "Subject and term are required.");
  const subject = await Subject.findOne({ subject_id: String(subjectId), school_id: req.actor.schoolId }).lean();
  if (!subject) return bad(res, 404, "Subject not found.");
  const term = await service.termContext(req.actor.schoolId, subsessionId);
  if (!term) return bad(res, 404, "Term not found.");
  if (!(await canUseSubject(req.actor, subjectId, null, "edit"))) return bad(res, 403, "You do not have access to this subject.", { code: "forbidden" });

  const base = { subject_id: subject.subject_id, subsession_id: term.subsession.term_id, class_id: null };
  const { fields, errors } = await buildDraftFields(req, base);
  if (errors.length) return bad(res, 422, errors[0].message, { errors });

  const test = await CbtTest.create({
    test_id: logic.makeId("cbt"),
    school_id: req.actor.schoolId,
    session_id: term.subsession.session_id,
    subsession_id: term.subsession.term_id,
    subject_id: subject.subject_id,
    subject_name: subject.subject_name,
    questions: [],
    ...fields,
    created_by: req.actor.id,
    created_by_role: req.actor.admin ? "admin" : "teacher",
    updated_by: req.actor.id,
  });
  await service.audit(req.actor, test, "create_draft");
  return reply(res, 201, { success: true, data: staffTest(test) });
});

const getTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view");
  if (!test) return;
  return ok(res, staffTest(test));
});

const updateTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "draft") return bad(res, 409, "Published tests can no longer be edited. Close the test instead.", { code: "not_draft" });
  const { fields, errors } = await buildDraftFields(req, test);
  if (errors.length) return bad(res, 422, errors[0].message, { errors });
  const updated = await CbtTest.findOneAndUpdate(
    { test_id: test.test_id, school_id: test.school_id, status: "draft" },
    { $set: { ...fields, updated_by: req.actor.id }, $inc: { version: 1 } },
    { returnDocument: "after" }
  );
  if (!updated) return bad(res, 409, "This test was published while you were editing.", { code: "not_draft" });
  return ok(res, staffTest(updated));
});

const getValidation = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view");
  if (!test) return;
  const term = await service.termContext(test.school_id, test.subsession_id);
  const max = term ? service.fieldMaxOf(term.fields, test.grading_field) : null;
  return ok(res, { problems: logic.publishProblems(test, max), assessment_max: max });
});

// ── Students ──────────────────────────────────────────────────────────────────
const listStudents = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view");
  if (!test) return;
  if (!test.class_id) return ok(res, []);
  const term = await service.termContext(test.school_id, test.subsession_id);
  const students = await classStudents(test, term?.subsession);
  const [assignments, attempts] = await Promise.all([
    CbtAssignment.find({ test_id: test.test_id }).lean(),
    CbtAttempt.find({ test_id: test.test_id }).lean(),
  ]);
  const assignmentMap = new Map(assignments.map((row) => [row.student_id, row]));
  const attemptsOf = groupAttempts(attempts);
  return ok(
    res,
    students.map((student) => {
      const assignment = assignmentMap.get(student.student_id);
      return {
        student_id: student.student_id,
        full_name: student.full_name,
        admission_number: student.admission_number,
        assigned: assignment?.status === "assigned",
        status: logic.sittingState(assignment, attemptsOf.get(student.student_id)),
      };
    })
  );
});

// ── Publish ───────────────────────────────────────────────────────────────────
const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const publishTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "draft") return bad(res, 409, "This test has already been published.", { code: "not_draft" });

  // The plan is checked before anything is created, so a Basic school keeps its draft untouched.
  const plan = await checkCbtAccess(test.school_id);
  if (!plan.allowed) return bad(res, 403, plan.message, { code: plan.code, plan_name: plan.plan_name });

  const term = await service.termContext(test.school_id, test.subsession_id);
  const assessmentMax = term ? service.fieldMaxOf(term.fields, test.grading_field) : null;
  const problems = logic.publishProblems(test, assessmentMax);
  if (test.grading_field && !service.safeFieldName(test.grading_field)) {
    problems.push({ field: "grading_field", message: "This assessment name cannot be written to the score sheet." });
  }

  // Sittings are started by the teacher, so a closing time is optional. Without one the test
  // stays open until the teacher closes it.
  const closesAt = parseDate(req.body?.closes_at);
  const opensAt = null;
  if (closesAt === undefined) problems.push({ field: "closes_at", message: "The closing time is not a valid date." });
  else if (closesAt && closesAt.getTime() <= Date.now()) problems.push({ field: "closes_at", message: "The closing time must be in the future." });

  const requested = Array.isArray(req.body?.student_ids) ? [...new Set(req.body.student_ids.map(String))] : [];
  if (requested.length === 0) problems.push({ field: "student_ids", message: "Select at least one student." });
  if (problems.length) return bad(res, 422, problems[0].message, { errors: problems });

  const eligible = new Set((await classStudents(test, term?.subsession)).map((student) => student.student_id));
  const outsiders = requested.filter((id) => !eligible.has(id));
  if (outsiders.length) return bad(res, 422, "Some selected students are not in this class.", { errors: [{ field: "student_ids", message: "Some selected students are not in this class." }] });

  const clash = await CbtTest.findOne({
    school_id: test.school_id,
    subject_id: test.subject_id,
    subsession_id: test.subsession_id,
    class_id: test.class_id,
    grading_field: test.grading_field,
    status: { $in: ["published", "closed"] },
    test_id: { $ne: test.test_id },
  }).lean();
  if (clash) {
    return bad(res, 409, `"${clash.title}" already feeds ${test.grading_field} for this class. Archive it first or choose a different assessment.`, { code: "assessment_in_use" });
  }

  const claimed = await CbtTest.findOneAndUpdate(
    { test_id: test.test_id, school_id: test.school_id, status: "draft" },
    {
      $set: {
        status: "published",
        published_at: new Date(),
        published_by: req.actor.id,
        opens_at: opensAt,
        closes_at: closesAt,
        assessment_max: assessmentMax,
        total_marks: logic.totalMarksOf(test.questions),
        access_code_hash: logic.hashAccessCode(secret(), test.school_id, logic.deriveAccessCode(secret(), test.test_id, test.access_code_version || 1)),
      },
    },
    { returnDocument: "after" }
  );
  if (!claimed) return bad(res, 409, "This test has already been published.", { code: "not_draft" });

  try {
    await CbtAssignment.bulkWrite(
      requested.map((studentId) => ({
        updateOne: {
          filter: { test_id: test.test_id, student_id: studentId },
          update: {
            $set: { status: "assigned", revoked_at: null },
            $setOnInsert: { assignment_id: logic.makeId("asg"), school_id: test.school_id, assigned_by: req.actor.id, assigned_at: new Date() },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    // Publishing is all-or-nothing: put the draft back and remove what was created.
    await CbtAssignment.deleteMany({ test_id: test.test_id });
    await CbtTest.updateOne({ test_id: test.test_id }, { $set: { status: "draft", published_at: null, published_by: null, access_code_hash: null } });
    console.error("[CBT] publish rolled back:", error.message);
    return bad(res, 500, "Could not publish the test. Your draft is unchanged.");
  }

  await service.audit(req.actor, claimed, "publish", { next: { closes_at: closesAt, opens_at: opensAt, students: requested.length } });
  return ok(res, staffTest(claimed), { assigned: requested.length });
});

// ── Access, deadline, close, archive ──────────────────────────────────────────
const updateAssignments = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "published") return bad(res, 409, "Student access can only be changed while the test is open.");
  const add = Array.isArray(req.body?.add) ? [...new Set(req.body.add.map(String))] : [];
  const remove = Array.isArray(req.body?.remove) ? [...new Set(req.body.remove.map(String))] : [];
  const term = await service.termContext(test.school_id, test.subsession_id);
  const eligible = new Set((await classStudents(test, term?.subsession)).map((student) => student.student_id));
  if (add.some((id) => !eligible.has(id))) return bad(res, 422, "Some selected students are not in this class.");

  const started = new Set((await CbtAttempt.find({ test_id: test.test_id, student_id: { $in: remove } }).select("student_id").lean()).map((row) => row.student_id));
  if (started.size) return bad(res, 409, "Students who have already started cannot be removed.", { student_ids: [...started] });

  if (add.length) {
    await CbtAssignment.bulkWrite(
      add.map((studentId) => ({
        updateOne: {
          filter: { test_id: test.test_id, student_id: studentId },
          update: {
            $set: { status: "assigned", revoked_at: null },
            $setOnInsert: { assignment_id: logic.makeId("asg"), school_id: test.school_id, assigned_by: req.actor.id, assigned_at: new Date() },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  if (remove.length) {
    await CbtAssignment.updateMany({ test_id: test.test_id, student_id: { $in: remove } }, { $set: { status: "revoked", revoked_at: new Date() } });
  }
  await service.audit(req.actor, test, "assignments_changed", { next: { added: add.length, removed: remove.length } });
  return ok(res, { added: add.length, removed: remove.length });
});

const regenerateCode = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "published") return bad(res, 409, "The exam code can only be changed while the test is open.");
  const version = (test.access_code_version || 1) + 1;
  const code = logic.deriveAccessCode(secret(), test.test_id, version);
  await CbtTest.updateOne({ test_id: test.test_id }, { $set: { access_code_version: version, access_code_hash: logic.hashAccessCode(secret(), test.school_id, code) } });
  await service.audit(req.actor, test, "code_regenerated");
  return ok(res, { access_code: code });
});

const extendDeadline = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "published" && test.status !== "closed") return bad(res, 409, "Only published tests have a closing time.");
  if (test.release_state !== "none") return bad(res, 409, "Results have been released, so the closing time can no longer change.");
  const next = parseDate(req.body?.closes_at);
  if (!next) return bad(res, 422, "Choose a valid closing time.");
  if (next.getTime() <= Date.now()) return bad(res, 422, "The closing time must be in the future.");
  const previous = test.closes_at;
  await CbtTest.updateOne({ test_id: test.test_id }, { $set: { closes_at: next, status: "published", closed_at: null } });
  await service.audit(req.actor, test, "deadline_extended", { previous: { closes_at: previous }, next: { closes_at: next } });
  return ok(res, { closes_at: next });
});

const closeTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status === "draft") return bad(res, 409, "A draft has nothing to close.");
  if (test.status === "published") {
    await CbtTest.updateOne({ test_id: test.test_id, status: "published" }, { $set: { status: "closed", closed_at: new Date() } });
  }
  const fresh = await CbtTest.findOne({ test_id: test.test_id });
  // Anything still being written is submitted as it stands; nothing is released automatically.
  const open = await CbtAttempt.find({ test_id: test.test_id, status: "in_progress" });
  for (const attempt of open) await service.finalizeAttempt(fresh, attempt, "closed");
  await service.settleTest(fresh);
  await service.audit(req.actor, fresh, "close");
  return ok(res, staffTest(fresh));
});

const removeTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status === "draft") {
    await CbtTest.deleteOne({ test_id: test.test_id, status: "draft" });
    await service.audit(req.actor, test, "delete_draft");
    return ok(res, { deleted: true });
  }
  // Anything that has been shown to students is archived so attempts and results survive.
  const open = await CbtAttempt.find({ test_id: test.test_id, status: "in_progress" });
  for (const attempt of open) await service.finalizeAttempt(test, attempt, "closed");
  await CbtTest.updateOne({ test_id: test.test_id }, { $set: { status: "archived", archived_at: new Date() } });
  await service.audit(req.actor, test, "archive");
  return ok(res, { archived: true });
});

// ── Results and marking ───────────────────────────────────────────────────────
const FILTERS = ["all", "not_started", "in_progress", "submitted", "awaiting_marking", "graded", "released"];

const getResults = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  await service.settleTest(test);
  const [assignments, attempts] = await Promise.all([
    CbtAssignment.find({ test_id: test.test_id, status: "assigned" }).lean(),
    CbtAttempt.find({ test_id: test.test_id }).lean(),
  ]);
  const students = await Student.find({ school_id: test.school_id, student_id: { $in: assignments.map((row) => row.student_id) } })
    .select("student_id full_name admission_number")
    .lean();
  const studentMap = new Map(students.map((row) => [row.student_id, row]));
  const attemptsOf = groupAttempts(attempts);

  const rows = assignments
    .map((assignment) => {
      const list = attemptsOf.get(assignment.student_id) || [];
      const attempt = logic.countedAttempt(list, assignment.counted_attempt_id);
      const student = studentMap.get(assignment.student_id);
      return {
        student_id: assignment.student_id,
        full_name: student?.full_name || "Unknown student",
        admission_number: student?.admission_number || null,
        status: logic.sittingState(assignment, list),
        attempts_count: list.length,
        attempt_id: attempt?.attempt_id || null,
        started_at: attempt?.started_at || null,
        submitted_at: attempt?.submitted_at || null,
        submit_reason: attempt?.submit_reason || null,
        marks_earned: attempt && attempt.status === "submitted" ? attempt.marks_earned : null,
        marks_possible: test.total_marks,
        percentage: attempt && attempt.status === "submitted" ? attempt.percentage : null,
        normalized_score: attempt && attempt.status === "submitted" ? attempt.normalized_score : null,
        grading_status: attempt?.grading_status || null,
        sync_status: attempt?.score_sync_status || "none",
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const count = (status) => rows.filter((row) => row.status === status).length;
  const finished = rows.filter((row) => ["awaiting_marking", "graded", "released"].includes(row.status));
  const marked = rows.filter((row) => ["graded", "released"].includes(row.status));
  const stats = {
    assigned: rows.length,
    not_started: count("not_started"),
    in_progress: count("in_progress"),
    submitted: finished.length,
    awaiting_marking: count("awaiting_marking"),
    graded: count("graded"),
    released: count("released"),
    absent: count("absent"),
    average_percentage: marked.length ? logic.round2(marked.reduce((sum, row) => sum + row.percentage, 0) / marked.length) : null,
  };

  const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "all";
  const visible = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "submitted") return finished.includes(row);
    if (filter === "graded") return row.status === "graded" || row.status === "released";
    return row.status === filter;
  });
  return ok(res, { test: staffTest(test), stats, rows: visible });
});

const getAttempt = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  const attempt = await CbtAttempt.findOne({ attempt_id: String(req.params.attemptId), test_id: test.test_id }).lean();
  if (!attempt) return bad(res, 404, "Attempt not found.");
  if (attempt.status === "in_progress" && new Date(attempt.allowed_end_at) > new Date()) {
    return bad(res, 409, "This student is still writing the test.", { code: "in_progress" });
  }
  await service.settleTest(test);
  const fresh = await CbtAttempt.findOne({ attempt_id: attempt.attempt_id }).lean();
  const responses = await CbtResponse.find({ attempt_id: attempt.attempt_id }).lean();
  const student = await Student.findOne({ student_id: attempt.student_id, school_id: test.school_id }).select("full_name admission_number").lean();
  const history = await CbtAudit.find({ test_id: test.test_id, attempt_id: attempt.attempt_id }).sort({ at: -1 }).limit(50).lean();
  const byQuestion = new Map(responses.map((row) => [row.question_id, row]));
  return ok(res, {
    attempt: fresh,
    student: { student_id: attempt.student_id, full_name: student?.full_name || "", admission_number: student?.admission_number || null },
    test: staffTest(test),
    items: (test.questions || []).map((question, index) => {
      const response = byQuestion.get(question.question_id);
      return {
        number: index + 1,
        question,
        answer: response?.answer || "",
        awarded_marks: response?.awarded_marks ?? null,
        grading_source: response?.grading_source || null,
        feedback: response?.feedback || "",
      };
    }),
    history,
  });
});

const gradeAttempt = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit", { allowArchived: true });
  if (!test) return;
  await service.settleTest(test);
  const attempt = await CbtAttempt.findOne({ attempt_id: String(req.params.attemptId), test_id: test.test_id });
  if (!attempt) return bad(res, 404, "Attempt not found.");
  if (attempt.status !== "submitted") return bad(res, 409, "This attempt has not been submitted yet.", { code: "in_progress" });

  const grades = Array.isArray(req.body?.grades) ? req.body.grades : [];
  if (grades.length === 0) return bad(res, 400, "Nothing to save.");
  const released = attempt.release_status === "released";
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (released && !reason) return bad(res, 422, "Add a reason for correcting a released result.", { code: "reason_required" });

  const questionMap = new Map((test.questions || []).map((question) => [question.question_id, question]));
  const responses = await CbtResponse.find({ attempt_id: attempt.attempt_id }).lean();
  const responseMap = new Map(responses.map((row) => [row.question_id, row]));

  const errors = [];
  const updates = [];
  for (const grade of grades) {
    const question = questionMap.get(String(grade?.question_id));
    if (!question) {
      errors.push({ question_id: grade?.question_id, message: "Unknown question." });
      continue;
    }
    if (question.type !== "short") {
      errors.push({ question_id: question.question_id, message: "Only short-answer questions are marked by hand." });
      continue;
    }
    const existing = responseMap.get(question.question_id);
    const feedback = String(grade.feedback ?? existing?.feedback ?? "").slice(0, 2000);
    const blank = grade.marks === null || grade.marks === undefined || grade.marks === "";
    let marks = existing?.awarded_marks ?? null;
    if (!blank) {
      const checked = logic.clampAwarded(grade.marks, question.marks);
      if (checked === null) {
        errors.push({ question_id: question.question_id, message: `Marks must be between 0 and ${question.marks}.` });
        continue;
      }
      marks = checked;
    }
    updates.push({ question, existing, marks, feedback });
  }
  if (errors.length) return bad(res, 422, errors[0].message, { errors });

  for (const item of updates) {
    const changedMarks = (item.existing?.awarded_marks ?? null) !== item.marks;
    const changedFeedback = (item.existing?.feedback || "") !== item.feedback;
    if (!changedMarks && !changedFeedback) continue;
    await CbtResponse.updateOne(
      { attempt_id: attempt.attempt_id, question_id: item.question.question_id },
      {
        $set: {
          awarded_marks: item.marks,
          grading_source: item.marks === null ? null : "manual",
          feedback: item.feedback,
          graded_by: req.actor.id,
          graded_at: new Date(),
        },
      }
    );
    await service.audit(req.actor, test, released ? "score_correction" : "grade", {
      attempt_id: attempt.attempt_id,
      question_id: item.question.question_id,
      student_id: attempt.student_id,
      previous: { marks: item.existing?.awarded_marks ?? null, feedback: item.existing?.feedback || "" },
      next: { marks: item.marks, feedback: item.feedback },
      reason,
    });
  }

  const recomputed = await service.recomputeAttempt(test, attempt.attempt_id);
  await CbtAttempt.updateOne({ attempt_id: attempt.attempt_id }, { $set: { graded_by: req.actor.id, graded_at: new Date() } });

  if (released && recomputed.grading_status === "graded") {
    try {
      const before = recomputed.synced_value;
      const synced = await service.syncScoreSheet(test, recomputed);
      await CbtAttempt.updateOne(
        { attempt_id: attempt.attempt_id },
        { $set: { synced_value: synced.value, score_sync_status: "synced", score_sync_error: null }, $inc: { result_version: 1 } }
      );
      await service.audit(req.actor, test, "score_updated", {
        attempt_id: attempt.attempt_id,
        student_id: attempt.student_id,
        previous: { value: before },
        next: { value: synced.value },
        reason,
      });
    } catch (error) {
      await CbtAttempt.updateOne({ attempt_id: attempt.attempt_id }, { $set: { score_sync_status: "failed", score_sync_error: error.message } });
      return bad(res, 500, "The marks were saved but the score sheet could not be updated. Try saving again.", { code: "sync_failed" });
    }
  }
  const final = await CbtAttempt.findOne({ attempt_id: attempt.attempt_id }).lean();
  return ok(res, final);
});

// ── Release ───────────────────────────────────────────────────────────────────
/** The submitted attempt that counts for each assigned student (latest, unless the teacher picked one). */
const countedSubmitted = (attempts, assignments) => {
  const attemptsOf = groupAttempts(attempts);
  return assignments
    .map((assignment) => logic.countedAttempt(attemptsOf.get(assignment.student_id), assignment.counted_attempt_id))
    .filter((attempt) => attempt && attempt.status === "submitted");
};

const releaseReview = async (test) => {
  await service.settleTest(test);
  const [attempts, assignments] = await Promise.all([
    CbtAttempt.find({ test_id: test.test_id }).lean(),
    CbtAssignment.find({ test_id: test.test_id, status: "assigned" }).lean(),
  ]);
  const students = await Student.find({ school_id: test.school_id, student_id: { $in: assignments.map((row) => row.student_id) } })
    .select("student_id full_name")
    .lean();
  const names = new Map(students.map((row) => [row.student_id, row.full_name]));
  const sheets = await StudentScore.find({ school_id: test.school_id, subject_id: test.subject_id, subsession_id: test.subsession_id, student_id: { $in: attempts.map((row) => row.student_id) } })
    .select("student_id scores")
    .lean();
  const sheetMap = new Map(sheets.map((row) => [row.student_id, row.scores || {}]));

  const blockers = [];
  if (test.status !== "closed") blockers.push("Close the test before releasing results.");
  const writing = attempts.filter((row) => row.status === "in_progress").length;
  if (writing) blockers.push(`${writing} student${writing === 1 ? " is" : "s are"} still writing.`);
  const counted = countedSubmitted(attempts, assignments);
  const pending = counted.filter((row) => row.grading_status !== "graded").length;
  if (pending) blockers.push(`${pending} attempt${pending === 1 ? " still needs" : "s still need"} marking.`);
  if (attempts.length === 0) blockers.push("No student has taken this test yet.");

  const rows = counted
    .map((row) => {
      const current = sheetMap.get(row.student_id)?.[test.grading_field];
      const hasCurrent = current !== undefined && current !== null && current !== "";
      return {
        attempt_id: row.attempt_id,
        student_id: row.student_id,
        full_name: names.get(row.student_id) || row.student_name || "Unknown student",
        marks_earned: row.marks_earned,
        marks_possible: row.marks_possible,
        percentage: row.percentage,
        normalized_score: row.normalized_score,
        release_status: row.release_status,
        sync_status: row.score_sync_status,
        current_sheet_value: hasCurrent ? Number(current) : null,
        replaces_existing: hasCurrent && Number(current) !== Number(row.normalized_score) && row.release_status !== "released",
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    blockers,
    destination: { subject_name: test.subject_name, field: test.grading_field, max: test.assessment_max },
    not_attempted: assignments.length - groupAttempts(attempts).size,
    rows,
  };
};

const getReleasePreview = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  return ok(res, { test: staffTest(test), ...(await releaseReview(test)) });
});

const releaseResults = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit", { allowArchived: true });
  if (!test) return;
  const review = await releaseReview(test);
  if (review.blockers.length) return bad(res, 409, review.blockers[0], { code: "not_ready", blockers: review.blockers });

  // One release at a time per test. A lock older than five minutes is treated as abandoned.
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  const locked = await CbtTest.findOneAndUpdate(
    { test_id: test.test_id, $or: [{ release_state: { $ne: "releasing" } }, { release_lock_at: { $lte: stale } }] },
    { $set: { release_state: "releasing", release_lock_at: new Date() } },
    { returnDocument: "after" }
  );
  if (!locked) return bad(res, 409, "A release is already running for this test.", { code: "release_running" });

  const failures = [];
  let released = 0;
  try {
    // Only each student's counted attempt is released; earlier attempts stay on record.
    const attempts = await CbtAttempt.find({
      test_id: test.test_id,
      attempt_id: { $in: review.rows.map((row) => row.attempt_id) },
      status: "submitted",
      grading_status: "graded",
      $or: [{ release_status: "unreleased" }, { score_sync_status: "failed" }],
    });
    for (const attempt of attempts) {
      try {
        const synced = await service.syncScoreSheet(test, attempt);
        await CbtAttempt.updateOne(
          { attempt_id: attempt.attempt_id },
          {
            $set: {
              release_status: "released",
              released_at: attempt.released_at || new Date(),
              released_by: req.actor.id,
              score_sync_status: "synced",
              score_sync_error: null,
              synced_value: synced.value,
              previous_sheet_value: attempt.previous_sheet_value ?? synced.previous,
            },
            $inc: { result_version: 1 },
          }
        );
        await service.audit(req.actor, test, "release", {
          attempt_id: attempt.attempt_id,
          student_id: attempt.student_id,
          previous: { sheet_value: synced.previous },
          next: { sheet_value: synced.value, field: test.grading_field },
        });
        released += 1;
      } catch (error) {
        await CbtAttempt.updateOne({ attempt_id: attempt.attempt_id }, { $set: { score_sync_status: "failed", score_sync_error: error.message } });
        failures.push({ student_id: attempt.student_id, message: error.message });
      }
    }
  } finally {
    await CbtTest.updateOne(
      { test_id: test.test_id },
      { $set: { release_state: failures.length ? "partial" : "released", release_lock_at: null, released_at: new Date(), released_by: req.actor.id } }
    );
  }
  if (failures.length) {
    return reply(res, 207, { success: false, message: `${failures.length} result${failures.length === 1 ? "" : "s"} could not be written to the score sheet. Release again to retry them.`, code: "partial", released, failures });
  }
  return ok(res, { released });
});

// ── Sittings: start, rewrite, add time, end, absent, counted attempt ──────────
const parseIds = (value) => (Array.isArray(value) ? [...new Set(value.map(String))].slice(0, 500) : []);

const testSummary = (test) => ({
  test_id: test.test_id,
  title: test.title,
  status: test.status,
  class_id: test.class_id,
  class_name: test.class_name,
  subject_name: test.subject_name,
  duration_minutes: test.duration_minutes,
  question_count: (test.questions || []).length,
  total_marks: test.total_marks,
  grading_field: test.grading_field,
  assessment_max: test.assessment_max,
  closes_at: test.closes_at,
  release_state: test.release_state,
  access_code: accessCodeOf(test),
});

/** Start the countdown for the selected students (kind "start") or give them another go ("rewrite"). */
const startSessions = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "published") {
    return bad(res, 409, test.status === "draft" ? "Assign students before starting the test." : "This test is closed. Reopen it before starting students.", { code: "not_open" });
  }
  const kind = req.body?.kind === "rewrite" ? "rewrite" : "start";
  const ids = parseIds(req.body?.student_ids);
  if (ids.length === 0) return bad(res, 422, "Select at least one student.");
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (kind === "rewrite" && !reason) return bad(res, 422, "Add a reason for the rewrite.", { code: "reason_required" });

  const [assignments, attempts, students] = await Promise.all([
    CbtAssignment.find({ test_id: test.test_id, student_id: { $in: ids }, status: "assigned" }).lean(),
    CbtAttempt.find({ test_id: test.test_id, student_id: { $in: ids } }).lean(),
    Student.find({ school_id: test.school_id, student_id: { $in: ids } }).select("student_id full_name").lean(),
  ]);
  const assigned = new Map(assignments.map((row) => [row.student_id, row]));
  const names = new Map(students.map((row) => [row.student_id, row.full_name]));
  const attemptsOf = groupAttempts(attempts);

  const started = [];
  const skipped = [];
  const now = new Date();
  for (const studentId of ids) {
    const assignment = assigned.get(studentId);
    const name = names.get(studentId) || "Student";
    if (!assignment) {
      skipped.push({ student_id: studentId, full_name: name, message: "Not assigned to this test." });
      continue;
    }
    const list = attemptsOf.get(studentId) || [];
    const problem = logic.startProblem(kind, list, logic.countedAttempt(list, assignment.counted_attempt_id));
    if (problem) {
      skipped.push({ student_id: studentId, full_name: name, message: problem });
      continue;
    }
    const number = (logic.latestAttempt(list)?.attempt_number || 0) + 1;
    try {
      await CbtAttempt.create({
        attempt_id: logic.makeId("att"),
        test_id: test.test_id,
        school_id: test.school_id,
        student_id: studentId,
        student_name: name,
        attempt_number: number,
        started_at: now,
        allowed_end_at: logic.attemptDeadline(now, test.duration_minutes, test.closes_at),
        started_by: req.actor.id,
        start_kind: kind,
        marks_possible: test.total_marks,
        normalized_max: test.assessment_max,
      });
    } catch (error) {
      // A double click: the unique index lets only one sitting exist for this number.
      if (error?.code !== 11000) throw error;
      skipped.push({ student_id: studentId, full_name: name, message: "Already started." });
      continue;
    }
    await CbtAssignment.updateOne({ assignment_id: assignment.assignment_id }, { $set: { absent: false, ...(kind === "rewrite" ? { counted_attempt_id: null } : {}) } });
    await service.audit(req.actor, test, kind === "rewrite" ? "rewrite_started" : "session_started", { student_id: studentId, next: { attempt_number: number }, reason });
    started.push(studentId);
  }
  if (started.length) await CbtTest.updateOne({ test_id: test.test_id, frozen: false }, { $set: { frozen: true } });
  return ok(res, { started: started.length, skipped });
});

const loadAttemptFor = async (req, res, test) => {
  const attempt = await CbtAttempt.findOne({ attempt_id: String(req.params.attemptId), test_id: test.test_id });
  if (!attempt) {
    bad(res, 404, "Attempt not found.");
    return null;
  }
  return attempt;
};

/** Submit a student's sitting now, whatever they have written so far. */
const endSession = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  const attempt = await loadAttemptFor(req, res, test);
  if (!attempt) return;
  if (attempt.status !== "in_progress") return bad(res, 409, "This sitting has already ended.");
  const done = await service.finalizeAttempt(test, attempt, "teacher");
  await service.audit(req.actor, test, "session_ended", { attempt_id: attempt.attempt_id, student_id: attempt.student_id });
  return ok(res, { status: done.status });
});

/** Give one student extra minutes, for example after a power cut. */
const addTime = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  const attempt = await loadAttemptFor(req, res, test);
  if (!attempt) return;
  const minutes = Number(req.body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return bad(res, 422, "Add between 1 and 120 minutes.");
  if (attempt.status !== "in_progress" || new Date(attempt.allowed_end_at).getTime() <= Date.now()) {
    return bad(res, 409, "Time has already run out for this student. Use Allow rewrite instead.", { code: "ended" });
  }
  const previous = attempt.allowed_end_at;
  const next = new Date(new Date(previous).getTime() + minutes * 60000);
  const updated = await CbtAttempt.findOneAndUpdate(
    { attempt_id: attempt.attempt_id, status: "in_progress", allowed_end_at: { $gt: new Date() } },
    { $set: { allowed_end_at: next }, $inc: { added_minutes: minutes } },
    { returnDocument: "after" }
  );
  if (!updated) return bad(res, 409, "Time has already run out for this student. Use Allow rewrite instead.", { code: "ended" });
  await service.audit(req.actor, test, "time_added", {
    attempt_id: attempt.attempt_id,
    student_id: attempt.student_id,
    previous: { allowed_end_at: previous },
    next: { allowed_end_at: next, minutes },
  });
  return ok(res, { allowed_end_at: updated.allowed_end_at });
});

const markAbsent = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  const studentId = String(req.params.studentId);
  const assignment = await CbtAssignment.findOne({ test_id: test.test_id, student_id: studentId, status: "assigned" });
  if (!assignment) return bad(res, 404, "That student is not assigned to this test.");
  const absent = req.body?.absent !== false;
  if (absent && (await CbtAttempt.exists({ test_id: test.test_id, student_id: studentId }))) {
    return bad(res, 409, "This student has already written the test.");
  }
  await CbtAssignment.updateOne({ assignment_id: assignment.assignment_id }, { $set: { absent } });
  await service.audit(req.actor, test, absent ? "marked_absent" : "absent_cleared", { student_id: studentId });
  return ok(res, { absent });
});

/** Choose which attempt's score counts for a student who wrote more than once. */
const setCounted = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  const studentId = String(req.params.studentId);
  const assignment = await CbtAssignment.findOne({ test_id: test.test_id, student_id: studentId, status: "assigned" });
  if (!assignment) return bad(res, 404, "That student is not assigned to this test.");
  const attempts = await CbtAttempt.find({ test_id: test.test_id, student_id: studentId }).lean();
  if (attempts.some((row) => row.release_status === "released")) {
    return bad(res, 409, "This student's result is already released. Correct the marks instead of switching attempts.");
  }
  const pickedId = req.body?.attempt_id ? String(req.body.attempt_id) : null;
  if (pickedId && !attempts.some((row) => row.attempt_id === pickedId && row.status === "submitted")) {
    return bad(res, 422, "Choose one of this student's submitted attempts.");
  }
  await CbtAssignment.updateOne({ assignment_id: assignment.assignment_id }, { $set: { counted_attempt_id: pickedId } });
  await service.audit(req.actor, test, "counted_attempt_set", {
    student_id: studentId,
    previous: { attempt_id: assignment.counted_attempt_id },
    next: { attempt_id: pickedId },
  });
  return ok(res, { counted_attempt_id: pickedId });
});

const reopenTest = wrap(async (req, res) => {
  const test = await loadTest(req, res, "edit");
  if (!test) return;
  if (test.status !== "closed") return bad(res, 409, "Only a closed test can be reopened.");
  const keepClose = test.closes_at && new Date(test.closes_at).getTime() > Date.now() ? test.closes_at : null;
  await CbtTest.updateOne({ test_id: test.test_id, status: "closed" }, { $set: { status: "published", closed_at: null, closes_at: keepClose } });
  await service.audit(req.actor, test, "reopen");
  return ok(res, { status: "published" });
});

/** The sitting screen: every assigned student with where they are right now. */
const getRoster = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  await service.settleTest(test);
  const fresh = await CbtTest.findOne({ test_id: test.test_id });
  const term = await service.termContext(test.school_id, test.subsession_id);
  const [classList, assignments, attempts] = await Promise.all([
    test.class_id ? classStudents(test, term?.subsession) : [],
    CbtAssignment.find({ test_id: test.test_id }).lean(),
    CbtAttempt.find({ test_id: test.test_id }).lean(),
  ]);
  const assignmentMap = new Map(assignments.map((row) => [row.student_id, row]));
  const attemptsOf = groupAttempts(attempts);

  // Students who were assigned but have since left the class still need to show up.
  const known = new Set(classList.map((student) => student.student_id));
  const extraIds = assignments.filter((row) => row.status === "assigned" && !known.has(row.student_id)).map((row) => row.student_id);
  const extra = extraIds.length ? await Student.find({ school_id: test.school_id, student_id: { $in: extraIds } }).select("student_id full_name admission_number").lean() : [];
  const everyone = [...classList, ...extra];

  const live = attempts.filter((row) => row.status === "in_progress").map((row) => row.attempt_id);
  const progress = live.length
    ? await CbtResponse.aggregate([
        { $match: { attempt_id: { $in: live }, answer: { $ne: "" } } },
        { $group: { _id: "$attempt_id", answered: { $sum: 1 }, last: { $max: "$updated_at" } } },
      ])
    : [];
  const progressMap = new Map(progress.map((row) => [row._id, row]));

  const rows = everyone.map((student) => {
    const assignment = assignmentMap.get(student.student_id);
    const assigned = assignment?.status === "assigned";
    const list = attemptsOf.get(student.student_id) || [];
    const counted = logic.countedAttempt(list, assignment?.counted_attempt_id);
    const writing = list.find((row) => row.status === "in_progress");
    const submitted = counted && counted.status === "submitted" ? counted : null;
    return {
      student_id: student.student_id,
      full_name: student.full_name,
      admission_number: student.admission_number || null,
      assigned,
      absent: Boolean(assignment?.absent),
      state: assigned ? logic.sittingState(assignment, list) : "not_assigned",
      attempts_count: list.length,
      attempt_number: logic.latestAttempt(list)?.attempt_number || 0,
      writing_attempt_id: writing?.attempt_id || null,
      started_at: writing?.started_at || null,
      ends_at: writing?.allowed_end_at || null,
      answered: writing ? progressMap.get(writing.attempt_id)?.answered || 0 : null,
      last_saved_at: writing ? progressMap.get(writing.attempt_id)?.last || null : null,
      counted_attempt_id: submitted?.attempt_id || null,
      marks_earned: submitted ? submitted.marks_earned : null,
      percentage: submitted ? submitted.percentage : null,
      normalized_score: submitted ? submitted.normalized_score : null,
      grading_status: submitted ? submitted.grading_status : null,
      release_status: submitted ? submitted.release_status : null,
      attempts: list.map((row) => ({
        attempt_id: row.attempt_id,
        attempt_number: row.attempt_number,
        status: row.status,
        submit_reason: row.submit_reason,
        submitted_at: row.submitted_at,
        marks_earned: row.status === "submitted" ? row.marks_earned : null,
        normalized_score: row.status === "submitted" ? row.normalized_score : null,
        release_status: row.release_status,
      })),
    };
  });
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name));

  const assignedRows = rows.filter((row) => row.assigned);
  const count = (state) => assignedRows.filter((row) => row.state === state).length;
  const stats = {
    assigned: assignedRows.length,
    not_started: count("not_started"),
    in_progress: count("in_progress"),
    awaiting_marking: count("awaiting_marking"),
    graded: count("graded"),
    released: count("released"),
    absent: count("absent"),
  };
  return ok(res, { test: testSummary(fresh), server_now: new Date(), stats, rows });
});

/** Marks and per-question results across each student's counted attempt. */
const getAnalysis = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  await service.settleTest(test);
  const [attempts, assignments] = await Promise.all([
    CbtAttempt.find({ test_id: test.test_id }).lean(),
    CbtAssignment.find({ test_id: test.test_id, status: "assigned" }).lean(),
  ]);
  const counted = countedSubmitted(attempts, assignments);
  const responses = counted.length ? await CbtResponse.find({ attempt_id: { $in: counted.map((row) => row.attempt_id) } }).lean() : [];

  const graded = counted.filter((row) => row.grading_status === "graded");
  const percentages = graded.map((row) => row.percentage);
  const summary = {
    submitted: counted.length,
    graded: graded.length,
    average: percentages.length ? logic.round2(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : null,
    highest: percentages.length ? Math.max(...percentages) : null,
    lowest: percentages.length ? Math.min(...percentages) : null,
    pass_rate: percentages.length ? logic.round2((percentages.filter((value) => value >= 50).length / percentages.length) * 100) : null,
  };

  const questions = (test.questions || []).map((question, index) => {
    const rows = responses.filter((row) => row.question_id === question.question_id);
    const answered = rows.filter((row) => String(row.answer || "").trim() !== "").length;
    const objective = question.type !== "short";
    const correct = objective ? rows.filter((row) => row.answer && row.answer === question.correct_option_id).length : null;
    const marked = rows.filter((row) => row.awarded_marks !== null && row.awarded_marks !== undefined);
    return {
      number: index + 1,
      question_id: question.question_id,
      type: question.type,
      prompt: question.prompt,
      marks: question.marks,
      answered,
      blank: rows.length - answered,
      correct_percent: objective && rows.length ? logic.round2((correct / rows.length) * 100) : null,
      average_marks: marked.length ? logic.round2(marked.reduce((sum, row) => sum + Number(row.awarded_marks), 0) / marked.length) : null,
    };
  });
  return ok(res, { summary, questions });
});

/** Every student's answer to one short question, for marking question by question. */
const getQuestionAnswers = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  await service.settleTest(test);
  const question = (test.questions || []).find((item) => item.question_id === String(req.params.questionId));
  if (!question) return bad(res, 404, "Question not found.");
  if (question.type !== "short") return bad(res, 422, "Only short-answer questions are marked by hand.");
  const [attempts, assignments] = await Promise.all([
    CbtAttempt.find({ test_id: test.test_id }).lean(),
    CbtAssignment.find({ test_id: test.test_id, status: "assigned" }).lean(),
  ]);
  const counted = countedSubmitted(attempts, assignments);
  const [responses, students] = await Promise.all([
    CbtResponse.find({ test_id: test.test_id, question_id: question.question_id, attempt_id: { $in: counted.map((row) => row.attempt_id) } }).lean(),
    Student.find({ school_id: test.school_id, student_id: { $in: counted.map((row) => row.student_id) } }).select("student_id full_name").lean(),
  ]);
  const names = new Map(students.map((row) => [row.student_id, row.full_name]));
  const byAttempt = new Map(responses.map((row) => [row.attempt_id, row]));
  const rows = counted
    .map((attempt) => {
      const response = byAttempt.get(attempt.attempt_id);
      return {
        attempt_id: attempt.attempt_id,
        student_id: attempt.student_id,
        full_name: names.get(attempt.student_id) || attempt.student_name || "Unknown student",
        answer: response?.answer || "",
        awarded_marks: response?.awarded_marks ?? null,
        feedback: response?.feedback || "",
        released: attempt.release_status === "released",
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const index = (test.questions || []).findIndex((item) => item.question_id === question.question_id);
  return ok(res, { number: index + 1, question, rows });
});

const getAudit = wrap(async (req, res) => {
  const test = await loadTest(req, res, "view", { allowArchived: true });
  if (!test) return;
  const rows = await CbtAudit.find({ test_id: test.test_id }).sort({ at: -1 }).limit(200).lean();
  const ids = [...new Set(rows.map((row) => row.student_id).filter(Boolean))];
  const students = ids.length ? await Student.find({ school_id: test.school_id, student_id: { $in: ids } }).select("student_id full_name").lean() : [];
  const names = new Map(students.map((row) => [row.student_id, row.full_name]));
  return ok(res, rows.map((row) => ({ ...row, student_name: row.student_id ? names.get(row.student_id) || "" : "" })));
});

module.exports = {
  getContext,
  listTests,
  createTest,
  getTest,
  updateTest,
  getValidation,
  listStudents,
  publishTest,
  updateAssignments,
  regenerateCode,
  extendDeadline,
  closeTest,
  removeTest,
  getResults,
  getAttempt,
  gradeAttempt,
  getReleasePreview,
  releaseResults,
  getAudit,
  startSessions,
  endSession,
  addTime,
  markAbsent,
  setCounted,
  reopenTest,
  getRoster,
  getAnalysis,
  getQuestionAnswers,
};
