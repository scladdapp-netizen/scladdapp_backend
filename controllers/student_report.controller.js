const StudentReport = require("../models/StudentReport.model");
const StudentReportCard = require("../models/StudentReportCard.model");
const StudentScore = require("../models/StudentScore.model");
const StudentTraitScore = require("../models/StudentTraitScore.model");
const StudentAttendance = require("../models/StudentAttendance.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const CombinedTemplate = require("../models/CombinedTemplate.model");
const Subsession = require("../models/Subsession.model");
const Subject = require("../models/Subject.model");
const Student = require("../models/Student.model");
const School = require("../models/School.model");
const Session = require("../models/Session.model");
const Class = require("../models/Class.model");
const StudentGuardian = require("../models/StudentGuardian.model");
const { queueEmail, getEmailQuota } = require("../utils/emailQueue");
const jwt = require("jsonwebtoken");

// ── helpers ──────────────────────────────────────────────────────────────────

const buildSubjectResult = (scoreRecord, gradingFields) => {
  const rawScores = scoreRecord.scores || {};
  const scores = {};
  for (const field of gradingFields) {
    const val = rawScores[field.field_name];
    scores[field.field_name] = { score: val !== undefined ? val : null, weight: Number(field.weight), max_score: Number(field.max_score) };
  }
  return { subject_id: scoreRecord.subject_id, subject_name: scoreRecord.subject_name, teacher_id: scoreRecord.teacher_id, teacher_name: scoreRecord.teacher_name, scores };
};

// ── Get scores for a student in a subsession ─────────────────────────────────
const getScoresByStudentSubsession = async (studentId, subsessionId) => {
  try {
    const scores = await StudentScore.find({ student_id: studentId, subsession_id: subsessionId }).lean();
    return { success: true, data: scores };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ── Subject positions for a student in a subsession/class ────────────────────
const getSubjectPositions = async (studentId, subsessionId, classId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const template = subsession.grading_template_id
      ? await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean()
      : null;
    const gradingFields = template?.grading_fields || [];

    const classAssignments = await StudentClassAssignment.find({ class_id: classId, session_id: subsession.session_id }).lean();
    const studentIdsInClass = new Set(classAssignments.map((a) => a.student_id));

    const allRecords = await StudentScore.find({ subsession_id: subsessionId, student_id: { $in: [...studentIdsInClass] } }).lean();

    const bySubject = {};
    allRecords.forEach((rec) => {
      if (!bySubject[rec.subject_id]) bySubject[rec.subject_id] = [];
      bySubject[rec.subject_id].push(rec);
    });

    const positions = {};
    Object.entries(bySubject).forEach(([subjectId, recs]) => {
      const ranked = recs
        .map((r) => ({ student_id: r.student_id, total: gradingFields.reduce((s, f) => s + (Number(r.scores?.[f.field_name]) || 0), 0) }))
        .sort((a, b) => b.total - a.total);
      const idx = ranked.findIndex((r) => r.student_id === studentId);
      if (idx !== -1) positions[subjectId] = idx + 1;
    });

    return { success: true, data: positions };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ── Class average for a subsession ───────────────────────────────────────────
const getClassAverage = async (subsessionId, classId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const template = await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean();
    if (!template) return { success: false, message: "Template not found" };

    const gradingFields = template.grading_fields || [];
    const maxTotal = gradingFields.reduce((s, f) => s + Number(f.max_score), 0);

    let records = await StudentScore.find({ subsession_id: subsessionId }).lean();

    let totalStudentsInClass = 0;
    if (classId) {
      const classAssignments = await StudentClassAssignment.find({ class_id: classId, session_id: subsession.session_id }).lean();
      const studentIdsInClass = new Set(classAssignments.map((a) => a.student_id));
      records = records.filter((s) => studentIdsInClass.has(s.student_id));
      totalStudentsInClass = classAssignments.length;
    }

    if (records.length === 0) return { success: true, data: { average: 0, student_count: 0, class_id: classId || null } };

    const byStudent = {};
    records.forEach((s) => { if (!byStudent[s.student_id]) byStudent[s.student_id] = []; byStudent[s.student_id].push(s); });

    const studentPercentages = Object.values(byStudent).map((recs) => {
      const rawTotal = recs.reduce((sum, rec) => sum + gradingFields.reduce((s, f) => s + (Number(rec.scores?.[f.field_name]) || 0), 0), 0);
      const maxPossible = maxTotal * recs.length;
      return maxPossible > 0 ? (rawTotal / maxPossible) * 100 : 0;
    });

    const average = studentPercentages.reduce((s, p) => s + p, 0) / studentPercentages.length;
    if (!classId) totalStudentsInClass = studentPercentages.length;

    const studentRankings = Object.entries(byStudent)
      .map(([sid, recs]) => ({ student_id: sid, raw_total: recs.reduce((sum, rec) => sum + gradingFields.reduce((s, f) => s + (Number(rec.scores?.[f.field_name]) || 0), 0), 0) }))
      .sort((a, b) => b.raw_total - a.raw_total);

    return { success: true, data: { average: Math.round(average * 100) / 100, student_count: totalStudentsInClass, student_rankings: studentRankings, subsession_id: subsessionId, class_id: classId || null } };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ── Generate / refresh a report for a student in a subsession ────────────────
const generateReport = async (studentId, subsessionId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };
    if (!subsession.grading_template_id) return { success: false, message: "Subsession has no grading template assigned" };

    const template = await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean();
    if (!template) return { success: false, message: "Grading template not found" };

    const gradingFields    = template.grading_fields || [];
    const behavioralTraits = template.behavioral_traits || [];

    const studentScores = await StudentScore.find({ student_id: studentId, subsession_id: subsessionId }).lean();
    if (studentScores.length === 0) return { success: false, message: "No scores found for this student in this subsession" };

    const subjects = studentScores.map((s) => buildSubjectResult(s, gradingFields));

    const existing = await StudentReport.findOne({ student_id: studentId, subsession_id: subsessionId });

    const reportData = {
      student_id:        studentId,
      student_name:      studentScores[0].student_name,
      school_id:         subsession.school_id,
      class_id:          studentScores[0].class_id || null,
      session_id:        subsession.session_id,
      subsession_id:     subsessionId,
      term_name:         subsession.term_name,
      template_id:       String(subsession.grading_template_id),
      generated_at:      new Date(),
      subjects,
      behavioral_traits: existing ? existing.behavioral_traits : behavioralTraits.map((t) => ({ trait: t, rating: null })),
      teacher_comment:   existing?.teacher_comment   || null,
      principal_comment: existing?.principal_comment || null,
    };

    let report;
    if (existing) {
      Object.assign(existing, reportData);
      report = await existing.save();
    } else {
      report = await StudentReport.create({ report_id: `REPORT-${Date.now()}`, ...reportData });
    }

    return { success: true, data: report, message: "Report generated successfully" };
  } catch (error) {
    console.error("Generate report error:", error);
    return { success: false, message: error.message };
  }
};

const getReport = async (studentId, subsessionId) => {
  try {
    const report = await StudentReport.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();
    if (!report) return { success: false, message: "Report not found" };
    return { success: true, data: report };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const getReportsByStudent = async (studentId) => {
  try {
    const reports = await StudentReport.find({ student_id: studentId }).lean();
    return { success: true, data: reports, count: reports.length };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const updateComments = async (studentId, subsessionId, { teacher_comment, principal_comment, behavioral_traits }) => {
  try {
    const report = await StudentReport.findOne({ student_id: studentId, subsession_id: subsessionId });
    if (!report) return { success: false, message: "Report not found" };
    if (teacher_comment   !== undefined) report.teacher_comment   = teacher_comment;
    if (principal_comment !== undefined) report.principal_comment = principal_comment;
    if (behavioral_traits !== undefined) report.behavioral_traits = behavioral_traits;
    await report.save();
    return { success: true, data: report, message: "Comments updated" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const updateSubjectScore = async (studentId, subsessionId, subjectId, scores) => {
  try {
    const scoreRecord = await StudentScore.findOne({ student_id: studentId, subsession_id: subsessionId, subject_id: subjectId });
    if (!scoreRecord) return { success: false, message: "Score record not found" };
    scoreRecord.scores     = { ...scoreRecord.scores, ...scores };
    scoreRecord.updated_at = new Date();
    await scoreRecord.save();
    return await generateReport(studentId, subsessionId);
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const deleteReport = async (studentId, subsessionId) => {
  try {
    const report = await StudentReport.findOneAndDelete({ student_id: studentId, subsession_id: subsessionId });
    if (!report) return { success: false, message: "Report not found" };
    return { success: true, message: "Report deleted" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const addSubjectScore = async (studentId, subsessionId, { subject_id, scores }) => {
  try {
    if (!subject_id) return { success: false, message: "subject_id is required" };

    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const exists = await StudentScore.findOne({ student_id: studentId, subsession_id: subsessionId, subject_id });
    if (exists) return { success: false, message: "Score record already exists for this subject" };

    const subject = await Subject.findOne({ subject_id }).lean();
    if (!subject) return { success: false, message: "Subject not found" };

    const classAssignment = await StudentClassAssignment.findOne({ student_id: studentId, session_id: subsession.session_id }).lean();
    const class_id = classAssignment?.class_id || null;

    const existingReport = await StudentReport.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();
    const existingScore  = await StudentScore.findOne({ student_id: studentId }).lean();
    const student_name   = existingReport?.student_name || existingScore?.student_name || "";

    await StudentScore.create({
      score_id:            `SCORE-${Date.now()}`,
      student_id:          studentId,
      student_name,
      school_id:           subsession.school_id,
      session_id:          subsession.session_id,
      subsession_id:       subsessionId,
      class_id,
      subject_id,
      subject_name:        subject.subject_name,
      teacher_id:          null,
      teacher_name:        null,
      grading_template_id: subsession.grading_template_id,
      scores:              scores || {},
      entered_by:          "admin",
      entered_at:          new Date(),
      updated_at:          new Date(),
    });

    return await generateReport(studentId, subsessionId);
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ── Report Card ───────────────────────────────────────────────────────────────
const getStudentsWithReportCardsBySubsession = async (subsessionId, params = {}) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const sessionId = subsession.session_id;
    const allAssignments = await StudentClassAssignment.find({ session_id: sessionId }).lean();

    // Deduplicate: keep most recent per student
    const latestByStudent = {};
    allAssignments.forEach((a) => {
      const ex = latestByStudent[a.student_id];
      if (!ex || new Date(a.created_at) > new Date(ex.created_at)) latestByStudent[a.student_id] = a;
    });
    const uniqueAssignments = Object.values(latestByStudent);

    const studentIds = uniqueAssignments.map((a) => a.student_id);
    const [students, reportCards] = await Promise.all([
      Student.find({ student_id: { $in: studentIds } }).lean(),
      StudentReportCard.find({ subsession_id: subsessionId, student_id: { $in: studentIds } }).lean(),
    ]);

    const studentMap    = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });
    const reportCardMap = {};
    reportCards.forEach((r) => { reportCardMap[r.student_id] = r; });

    let rows = uniqueAssignments.map((a) => {
      const student    = studentMap[a.student_id];
      const reportCard = reportCardMap[a.student_id];
      return {
        assignment_id:    a.assignment_id,
        student_id:       a.student_id,
        student_name:     student?.full_name || "Unknown",
        admission_number: student?.admission_number || "N/A",
        class_name:       a.class_name || "N/A",
        has_report:       !!reportCard,
        is_published:     reportCard?.is_published ?? null,
        email:            student?.email || null,
        report_card_id:   reportCard?.report_card_id || null,
        teacher_remark:   reportCard?.teacher_remark || null,
        principal_remark: reportCard?.principal_remark || null,
        updated_at:       reportCard?.updated_at || null,
      };
    });

    const search = (params.search || "").toLowerCase();
    if (search) {
      rows = rows.filter((r) =>
        r.student_name.toLowerCase().includes(search) ||
        r.admission_number.toLowerCase().includes(search) ||
        r.class_name.toLowerCase().includes(search)
      );
    }

    const sortBy = params.sortBy || "student_name";
    const sortOrder = params.sortOrder || "asc";
    rows.sort((a, b) => {
      const aVal = String(a[sortBy] || "").toLowerCase();
      const bVal = String(b[sortBy] || "").toLowerCase();
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const page  = parseInt(params.page)  || 1;
    const limit = parseInt(params.limit) || 20;
    const total = rows.length;
    const start = (page - 1) * limit;

    return { success: true, data: rows.slice(start, start + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const getReportCard = async (studentId, subsessionId) => {
  try {
    const record = await StudentReportCard.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();
    if (!record) return { success: false, message: "Report card not found" };
    return { success: true, data: record };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const saveReportCard = async (studentId, subsessionId, body) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    const existing   = await StudentReportCard.findOne({ student_id: studentId, subsession_id: subsessionId });

    if (existing) {
      const isPublishing = body.is_published === true && !existing.is_published;
      let publishedSubjects = existing.published_subjects;

      if (isPublishing) {
        const classAssignment = await StudentClassAssignment.findOne({ student_id: studentId, session_id: subsession?.session_id }).lean();
        const classId = classAssignment?.class_id || existing.class_id || null;
        if (classId) {
          const [csAssignments, allSubjects] = await Promise.all([
            ClassSubjectAssignment.find({ class_id: classId, is_active: true }).lean(),
            Subject.find({}).lean(),
          ]);
          const subjectMap = {};
          allSubjects.forEach((s) => { subjectMap[s.subject_id] = s; });
          publishedSubjects = csAssignments.map((a) => ({
            subject_id:   a.subject_id,
            subject_name: subjectMap[a.subject_id]?.subject_name || "Unknown",
            subject_code: subjectMap[a.subject_id]?.subject_code || "—",
          }));
        }
      }

      if (body.teacher_remark   !== undefined) existing.teacher_remark   = body.teacher_remark;
      if (body.principal_remark !== undefined) existing.principal_remark = body.principal_remark;
      if (body.is_published     !== undefined) existing.is_published     = body.is_published;
      if (Array.isArray(body.subjects))        existing.subjects         = body.subjects;
      existing.published_subjects = publishedSubjects;
      existing.updated_at = new Date();
      await existing.save();
      return { success: true, data: existing };
    }

    // New record
    const classAssignment = await StudentClassAssignment.findOne({ student_id: studentId, session_id: subsession?.session_id }).lean();
    const classId = classAssignment?.class_id || null;

    let activeSubjects = [];
    if (classId) {
      const [csAssignments, allSubjects] = await Promise.all([
        ClassSubjectAssignment.find({ class_id: classId, is_active: true }).lean(),
        Subject.find({}).lean(),
      ]);
      const subjectMap = {};
      allSubjects.forEach((s) => { subjectMap[s.subject_id] = s; });
      activeSubjects = csAssignments.map((a) => ({
        subject_id:   a.subject_id,
        subject_name: subjectMap[a.subject_id]?.subject_name || "Unknown",
        subject_code: subjectMap[a.subject_id]?.subject_code || "—",
      }));
    }

    const newRecord = await StudentReportCard.create({
      report_card_id:   `RC-${Date.now()}`,
      student_id:       studentId,
      school_id:        subsession?.school_id || null,
      session_id:       subsession?.session_id || null,
      subsession_id:    subsessionId,
      class_id:         classId,
      subjects:         Array.isArray(body.subjects) ? body.subjects : activeSubjects,
      teacher_remark:   body.teacher_remark   || null,
      principal_remark: body.principal_remark || null,
      is_published:     body.is_published     ?? false,
      updated_at:       new Date(),
    });
    return { success: true, data: newRecord };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// ── Preview data ──────────────────────────────────────────────────────────────
const getPreviewData = async (studentId, subsessionId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const template = await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean();
    if (!template) return { success: false, message: "Template not found" };

    const gradingFields = template.grading_fields || [];
    const gradingScheme = template.grading_scheme || [];

    const [session, school, student] = await Promise.all([
      Session.findOne({ session_id: subsession.session_id }).lean(),
      School.findOne({ school_id: subsession.school_id }).lean(),
      Student.findOne({ student_id: studentId }).lean(),
    ]);
    if (!student) return { success: false, message: "Student not found" };

    const classAssignment = await StudentClassAssignment.findOne({ student_id: studentId, session_id: subsession.session_id }).lean();
    const classId  = classAssignment?.class_id || null;
    const classRec = classId ? await Class.findOne({ class_id: classId }).lean() : null;

    const reportCard = await StudentReportCard.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();

    // Subjects: use snapshotted subjects from report card if available
    let classSubjects;
    if (reportCard?.subjects?.length > 0) {
      classSubjects = reportCard.subjects.map((s) => ({ subject_id: s.subject_id, subject_name: s.subject_name }));
    } else if (classId) {
      const [csAssignments, allSubjects] = await Promise.all([
        ClassSubjectAssignment.find({ class_id: classId, is_active: true }).lean(),
        Subject.find({}).lean(),
      ]);
      const subjectMap = {};
      allSubjects.forEach((s) => { subjectMap[s.subject_id] = s; });
      classSubjects = csAssignments.map((a) => ({ subject_id: a.subject_id, subject_name: subjectMap[a.subject_id]?.subject_name || "Unknown" }));
    } else {
      classSubjects = [];
    }

    const studentScores = await StudentScore.find({ student_id: studentId, subsession_id: subsessionId }).lean();

    // Positions
    const classAssignments = classId
      ? await StudentClassAssignment.find({ class_id: classId, session_id: subsession.session_id }).lean()
      : [];
    const studentIdsInClass = new Set(classAssignments.map((a) => a.student_id));
    const classRecords = await StudentScore.find({ subsession_id: subsessionId, student_id: { $in: [...studentIdsInClass] } }).lean();

    const bySubject = {};
    classRecords.forEach((rec) => { if (!bySubject[rec.subject_id]) bySubject[rec.subject_id] = []; bySubject[rec.subject_id].push(rec); });
    const positionMap = {};
    Object.entries(bySubject).forEach(([subjectId, recs]) => {
      const ranked = recs.map((r) => ({ student_id: r.student_id, total: gradingFields.reduce((s, f) => s + (Number(r.scores?.[f.field_name]) || 0), 0) })).sort((a, b) => b.total - a.total);
      const idx = ranked.findIndex((r) => r.student_id === studentId);
      if (idx !== -1) positionMap[subjectId] = idx + 1;
    });

    const maxTotal = gradingFields.reduce((s, f) => s + Number(f.max_score), 0);
    const getGrade = (total) => {
      if (!gradingScheme.length || maxTotal === 0) return "";
      const pct = (total / maxTotal) * 100;
      const match = gradingScheme.find((g) => pct >= Number(g.min_range) && pct <= Number(g.max_range));
      return match ? match.grade_letter : "";
    };

    const subjects = classSubjects.map((cs) => {
      const scoreRec = studentScores.find((s) => s.subject_id === cs.subject_id);
      const scores   = scoreRec?.scores || {};
      const total    = scoreRec ? gradingFields.reduce((s, f) => s + (Number(scores[f.field_name]) || 0), 0) : null;
      return { name: cs.subject_name, scores, total, grade: total !== null ? getGrade(total) : "—", position: positionMap[cs.subject_id] ? `${positionMap[cs.subject_id]}` : "—" };
    });

    // Overall position
    const byStudent = {};
    classRecords.forEach((s) => { if (!byStudent[s.student_id]) byStudent[s.student_id] = []; byStudent[s.student_id].push(s); });
    const rankings = Object.entries(byStudent)
      .map(([sid, recs]) => ({ student_id: sid, raw_total: recs.reduce((sum, rec) => sum + gradingFields.reduce((s, f) => s + (Number(rec.scores?.[f.field_name]) || 0), 0), 0) }))
      .sort((a, b) => b.raw_total - a.raw_total);
    const overallPos = rankings.findIndex((r) => r.student_id === studentId) + 1;

    const traitRec = await StudentTraitScore.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();

    const attRecords = await StudentAttendance.find({ student_id: studentId, subsession_id: subsessionId }).lean();
    const attPresent = attRecords.filter((a) => a.status === "present").length;
    const attAbsent  = attRecords.filter((a) => a.status === "absent").length;
    const attExcused = attRecords.filter((a) => a.status === "excused").length;
    const attOpened  = attRecords.length;
    const attRate    = attOpened > 0 ? `${Math.round((attPresent / attOpened) * 100)}%` : "—";

    const studentData = {
      studentName:     student.full_name,
      gender:          student.gender,
      class:           classRec ? `${classRec.class_name}${classRec.class_section ? " " + classRec.class_section : ""}` : "—",
      session:         session?.session_name || "—",
      term:            subsession.term_name,
      admissionId:     student.admission_number,
      dob:             student.date_of_birth,
      profileImg:      student.student_photo || null,
      schoolName:      school?.school_name || "—",
      schoolAddress:   school?.address || "—",
      schoolPhone:     school?.phone_number || "—",
      schoolEmail:     school?.email || "—",
      schoolLogo:      school?.logo_url || null,
      subjects,
      attendance:      { opened: attOpened, present: attPresent, absent: attAbsent, excused: attExcused, rate: attRate },
      position:        overallPos > 0 ? `${overallPos} / ${rankings.length}` : "—",
      traits:          traitRec?.traits || {},
      teacherRemark:   reportCard?.teacher_remark   || null,
      principalRemark: reportCard?.principal_remark || null,
    };

    return { success: true, data: { student: studentData, template } };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// ── Scores by subject + subsession (paginated) ────────────────────────────────
const getScoresBySubjectSubsession = async (subjectId, subsessionId, params = {}) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    let gradingFields = [];
    if (subsession?.grading_template_id) {
      const template = await CombinedTemplate.findOne({ template_id: String(subsession.grading_template_id) }).lean();
      if (template) gradingFields = template.grading_fields || [];
    }
    const sessionId = subsession?.session_id || null;

    const classIdsWithSubject = await ClassSubjectAssignment.distinct("class_id", { subject_id: subjectId, is_active: true });

    const query = { class_id: { $in: classIdsWithSubject }, is_active: true };
    if (sessionId) query.session_id = sessionId;
    const studentAssignments = await StudentClassAssignment.find(query).lean();

    const latestByStudent = {};
    studentAssignments.forEach((a) => {
      const ex = latestByStudent[a.student_id];
      if (!ex || new Date(a.created_at) > new Date(ex.created_at)) latestByStudent[a.student_id] = a;
    });
    const uniqueAssignments = Object.values(latestByStudent);

    const studentIds = uniqueAssignments.map((a) => a.student_id);
    const [students, scoreRecords] = await Promise.all([
      Student.find({ student_id: { $in: studentIds } }).lean(),
      StudentScore.find({ subject_id: subjectId, subsession_id: subsessionId, student_id: { $in: studentIds } }).lean(),
    ]);

    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });
    const scoreLookup = {};
    scoreRecords.forEach((s) => { scoreLookup[s.student_id] = s; });

    let rows = uniqueAssignments.map((a) => {
      const scoreRec = scoreLookup[a.student_id] || null;
      const scores   = scoreRec?.scores || null;
      const total    = scores ? gradingFields.reduce((sum, f) => sum + (Number(scores[f.field_name]) || 0), 0) : null;
      return {
        student_id:   a.student_id,
        student_name: studentMap[a.student_id]?.full_name || scoreRec?.student_name || "—",
        class_id:     a.class_id,
        class_name:   a.class_name || "—",
        teacher_name: scoreRec?.teacher_name || "—",
        scores,
        total,
        has_score:    !!scoreRec,
        score_id:     scoreRec?.score_id || null,
      };
    });

    const search = (params.search || "").toLowerCase();
    if (search) {
      rows = rows.filter((r) =>
        (r.student_name || "").toLowerCase().includes(search) ||
        (r.student_id   || "").toLowerCase().includes(search) ||
        (r.class_name   || "").toLowerCase().includes(search)
      );
    }

    const sortBy = params.sortBy || "student_name";
    const sortOrder = params.sortOrder || "asc";
    rows.sort((a, b) => {
      const aVal = String(a[sortBy] ?? "").toLowerCase();
      const bVal = String(b[sortBy] ?? "").toLowerCase();
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const page  = parseInt(params.page)  || 1;
    const limit = parseInt(params.limit) || 20;
    const total = rows.length;
    const start = (page - 1) * limit;

    return {
      success: true,
      data: rows.slice(start, start + limit),
      grading_fields: gradingFields,
      pagination: { currentPage: page, totalPages: Math.ceil(total / limit) || 1, totalRecords: total, recordsPerPage: limit, hasNextPage: page < Math.ceil(total / limit), hasPrevPage: page > 1, startIndex: total === 0 ? 0 : start + 1, endIndex: Math.min(start + limit, total) },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ── Email: send published result ─────────────────────────────────────────────
const REPORT_PDF_TOKEN_PURPOSE = "report_pdf_download";

const createReportPdfDownloadToken = (studentId, subsessionId, schoolId) =>
  jwt.sign(
    {
      purpose: REPORT_PDF_TOKEN_PURPOSE,
      student_id: studentId,
      subsession_id: subsessionId,
      school_id: schoolId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );

const getReportDownloadPayload = async (token) => {
  try {
    if (!token) return { success: false, message: "Download token is required" };

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return { success: false, message: "This download link is invalid or has expired" };
    }

    if (payload?.purpose !== REPORT_PDF_TOKEN_PURPOSE) {
      return { success: false, message: "Invalid download token" };
    }

    const studentId = payload.student_id;
    const subsessionId = payload.subsession_id;
    if (!studentId || !subsessionId) {
      return { success: false, message: "Invalid download token payload" };
    }

    const reportCard = await StudentReportCard.findOne({
      student_id: studentId,
      subsession_id: subsessionId,
    }).lean();
    if (!reportCard) return { success: false, message: "Report card not found" };
    if (!reportCard.is_published) {
      return { success: false, message: "This report is no longer published" };
    }

    const preview = await getPreviewData(studentId, subsessionId);
    if (!preview?.success) {
      return { success: false, message: preview?.message || "Failed to load report data" };
    }

    let schoolDoc = null;
    if (payload.school_id) {
      schoolDoc = await School.findOne({ school_id: payload.school_id }).lean();
    }
    if (!schoolDoc) {
      const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
      if (subsession?.school_id) {
        schoolDoc = await School.findOne({ school_id: subsession.school_id }).lean();
      }
    }

    const student = preview.data.student;
    return {
      success: true,
      data: {
        student,
        template: preview.data.template,
        school: {
          school_id: schoolDoc?.school_id || payload.school_id || null,
          school_name: schoolDoc?.school_name || student?.schoolName || "School",
          address: schoolDoc?.address || student?.schoolAddress || "",
          phone_number: schoolDoc?.phone_number || student?.schoolPhone || "",
          email: schoolDoc?.email || student?.schoolEmail || "",
          logo_url: schoolDoc?.logo_url || student?.schoolLogo || null,
        },
        report_card: {
          teacher_remark: reportCard.teacher_remark || "",
          principal_remark: reportCard.principal_remark || "",
          is_published: true,
        },
      },
    };
  } catch (err) {
    console.error("getReportDownloadPayload error:", err);
    return { success: false, message: err.message || "Failed to load download data" };
  }
};

const buildResultEmailHtml = ({
  studentName,
  sessionName,
  termName,
  downloadUrl,
  loginUrl,
}) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Academic Result</title></head>
<body style="margin:0;padding:32px 16px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:28px 24px">
    <p style="font-size:16px;font-weight:700;margin:0 0 8px;line-height:1.3">Hello ${studentName || "Student"},</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 22px">
      Your academic result for <strong>${termName || "this term"}</strong>
      (${sessionName || "current session"}) is now available on ScladApp.
    </p>
    <p style="margin:0 0 12px">
      <a href="${downloadUrl}" style="display:inline-block;padding:13px 22px;background:#111;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Download Report PDF &rarr;</a>
    </p>
    ${loginUrl ? `<p style="margin:0"><a href="${loginUrl}" style="display:inline-block;padding:12px 22px;background:#fff;color:#111;border:1px solid #111;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">View Dashboard &rarr;</a></p>` : ""}
  </div>
</body></html>`;

const resolveRecipientEmail = async (student) => {
  if (student?.email && String(student.email).includes("@")) {
    return { email: student.email.trim().toLowerCase(), source: "student" };
  }
  const guardians = await StudentGuardian.find({ student_id: student.student_id }).lean();
  const primary = guardians.find((g) => g.is_primary) || guardians[0];
  if (primary?.guardian_email && String(primary.guardian_email).includes("@")) {
    return { email: primary.guardian_email.trim().toLowerCase(), source: "guardian" };
  }
  return null;
};

const sendReportResultEmail = async (studentId, subsessionId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return { success: false, message: "Subsession not found" };

    const reportCard = await StudentReportCard.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();
    if (!reportCard) return { success: false, message: "Report card not found", code: "no_report" };
    if (!reportCard.is_published) {
      return { success: false, message: "Report card is not published", code: "not_published" };
    }

    const [student, school, session] = await Promise.all([
      Student.findOne({ student_id: studentId }).lean(),
      School.findOne({ school_id: subsession.school_id }).lean(),
      Session.findOne({ session_id: subsession.session_id }).lean(),
    ]);
    if (!student) return { success: false, message: "Student not found" };

    const recipient = await resolveRecipientEmail(student);
    if (!recipient) {
      return { success: false, message: "No email address found for student or guardian", code: "no_email" };
    }

    const frontendBase = String(
      process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5174"
    ).replace(/\/$/, "");
    const schoolId = school?.school_id || subsession.school_id;
    const loginUrl = `${frontendBase}/school/${schoolId}/login`;
    const schoolName = school?.school_name || "School";

    const downloadToken = createReportPdfDownloadToken(studentId, subsessionId, schoolId);
    const downloadUrl = `${frontendBase}/report-download?token=${encodeURIComponent(downloadToken)}`;

    const html = buildResultEmailHtml({
      studentName: student.full_name,
      sessionName: session?.session_name || "—",
      termName: subsession.term_name || "—",
      downloadUrl,
      loginUrl,
    });

    const result = await queueEmail({
      to: recipient.email,
      subject: `${schoolName} — ${subsession.term_name || "Term"} result for ${student.full_name}`,
      html,
      displayName: schoolName,
      replyTo: school?.email || undefined,
    });

    return {
      success: true,
      data: {
        student_id: studentId,
        email: recipient.email,
        recipient_source: recipient.source,
        sent: !!result.sent,
        queued: !!result.queued,
        quota: getEmailQuota(),
        download_url: downloadUrl,
      },
      message: result.sent
        ? "Result email sent successfully"
        : "Daily email limit reached — result email was queued and will send later",
    };
  } catch (err) {
    console.error("sendReportResultEmail error:", err);
    return { success: false, message: err.message || "Failed to send result email" };
  }
};

const sendReportResultEmailsBulk = async (subsessionId, studentIds = []) => {
  try {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return { success: false, message: "student_ids array is required" };
    }

    const summary = {
      sent: 0,
      queued: 0,
      skipped_not_published: 0,
      skipped_no_report: 0,
      skipped_no_email: 0,
      failed: 0,
      results: [],
    };

    for (const studentId of studentIds) {
      const res = await sendReportResultEmail(studentId, subsessionId);
      if (res.success) {
        if (res.data?.sent) summary.sent++;
        else if (res.data?.queued) summary.queued++;
        summary.results.push({ student_id: studentId, status: res.data?.sent ? "sent" : "queued", email: res.data?.email });
      } else if (res.code === "not_published") {
        summary.skipped_not_published++;
        summary.results.push({ student_id: studentId, status: "skipped_not_published" });
      } else if (res.code === "no_report") {
        summary.skipped_no_report++;
        summary.results.push({ student_id: studentId, status: "skipped_no_report" });
      } else if (res.code === "no_email") {
        summary.skipped_no_email++;
        summary.results.push({ student_id: studentId, status: "skipped_no_email" });
      } else {
        summary.failed++;
        summary.results.push({ student_id: studentId, status: "failed", message: res.message });
      }
    }

    summary.quota = getEmailQuota();
    return {
      success: true,
      data: summary,
      message: `Sent ${summary.sent}, queued ${summary.queued}. Skipped ${summary.skipped_not_published} not published, ${summary.skipped_no_email} without email.`,
    };
  } catch (err) {
    return { success: false, message: err.message || "Failed to send result emails" };
  }
};

module.exports = {
  getScoresByStudentSubsession, getSubjectPositions, getClassAverage,
  generateReport, getReport, getReportsByStudent, updateComments,
  updateSubjectScore, addSubjectScore, deleteReport,
  getReportCard, getStudentsWithReportCardsBySubsession, saveReportCard,
  getPreviewData, getScoresBySubjectSubsession,
  sendReportResultEmail, sendReportResultEmailsBulk, getEmailQuota,
  getReportDownloadPayload,
};
