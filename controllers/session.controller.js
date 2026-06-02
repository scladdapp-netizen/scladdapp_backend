const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");
const ClassHeadmaster = require("../models/ClassHeadmaster.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Alumni = require("../models/Alumni.model");
const Admission = require("../models/Admission.model");

const calculateSessionStatus = (startDate, endDate) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end   = new Date(endDate);   end.setHours(0, 0, 0, 0);
  if (today < start) return "draft";
  if (today >= start && today <= end) return "active";
  return "completed";
};

const validateSessionData = (data) => {
  const errors = [];
  if (!data.session_name?.trim())          errors.push("Session name is required");
  if (!data.session_code?.trim())          errors.push("Session code is required");
  if (!data.academic_year_start_date)      errors.push("Academic year start date is required");
  if (!data.academic_year_end_date)        errors.push("Academic year end date is required");
  if (data.academic_year_start_date && data.academic_year_end_date) {
    const start = new Date(data.academic_year_start_date);
    const end   = new Date(data.academic_year_end_date);
    if (start >= end) errors.push("End date must be after start date");
    const today = new Date(); today.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
    if (end < today) errors.push("Cannot create a session that has already ended. The end date must be today or in the future.");
  }
  return errors;
};

const withStatus = (session) => {
  if (!session) return session;
  if (session.is_archived) return { ...session, session_status: "archived" };
  return { ...session, session_status: calculateSessionStatus(session.academic_year_start_date, session.academic_year_end_date) };
};

// POST /session
exports.createSession = async (req, res) => {
  try {
    const { school_id, session_name, session_code, academic_year_start_date, academic_year_end_date,
            session_status, created_by, created_by_name, created_by_role } = req.body;

    if (!school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validateSessionData(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const duplicate = await Session.findOne({ school_id, session_code });
    if (duplicate) return res.status(400).json({ success: false, message: "Session code already exists for this school" });

    const newSession = await Session.create({
      session_id:                Date.now().toString(),
      school_id,
      session_name:              session_name.trim(),
      session_code:              session_code.trim(),
      academic_year_start_date,
      academic_year_end_date,
      session_status:            session_status || "draft",
      is_archived:               false,
      created_by:                created_by || null,
      created_by_name:           created_by_name || null,
      created_by_role:           created_by_role || null,
    });

    res.status(201).json({ success: true, message: "Session created successfully", data: newSession });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create session", error: error.message });
  }
};

// GET /session/school/:schoolId
exports.getSessionsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const sessions = await Session.find({ school_id: schoolId }).lean();
    const data = sessions.map(withStatus);

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve sessions", error: error.message });
  }
};

// GET /session/:sessionId
exports.getSessionById = async (req, res) => {
  try {
    const session = await Session.findOne({ session_id: req.params.sessionId }).lean();
    if (!session) return res.status(404).json({ success: false, message: "Session not found" });
    res.json({ success: true, data: withStatus(session) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve session", error: error.message });
  }
};

// PUT /session/:sessionId
exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { session_name, session_code, academic_year_start_date, academic_year_end_date, session_status, modified_by } = req.body;

    const session = await Session.findOne({ session_id: sessionId });
    if (!session) return res.status(404).json({ success: false, message: "Session not found" });

    // Validate if dates/name/code are being updated
    if (session_name || session_code || academic_year_start_date || academic_year_end_date) {
      const validationData = {
        session_name:              session_name              || session.session_name,
        session_code:              session_code              || session.session_code,
        academic_year_start_date:  academic_year_start_date  || session.academic_year_start_date,
        academic_year_end_date:    academic_year_end_date    || session.academic_year_end_date,
      };
      const errors = validateSessionData(validationData);
      if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    // Check duplicate code
    if (session_code && session_code !== session.session_code) {
      const dup = await Session.findOne({ school_id: session.school_id, session_code, session_id: { $ne: sessionId } });
      if (dup) return res.status(400).json({ success: false, message: "Session code already exists for this school" });
    }

    // Check date overlap
    if (academic_year_start_date && academic_year_end_date) {
      const newStart = new Date(academic_year_start_date);
      const newEnd   = new Date(academic_year_end_date);

      const overlap = await Session.findOne({
        school_id:   session.school_id,
        session_id:  { $ne: sessionId },
        is_archived: { $ne: true },
        academic_year_start_date: { $lt: academic_year_end_date },
        academic_year_end_date:   { $gt: academic_year_start_date },
      });

      if (overlap) {
        return res.status(400).json({
          success: false,
          message: `Session dates overlap with existing session "${overlap.session_name}" (${overlap.session_code})`,
          error: "DATE_OVERLAP",
          conflicting_session: { session_id: overlap.session_id, session_name: overlap.session_name, session_code: overlap.session_code, start_date: overlap.academic_year_start_date, end_date: overlap.academic_year_end_date },
        });
      }

      // Check subsessions are within new range
      const outOfRange = await Subsession.find({
        session_id:  sessionId,
        is_archived: { $ne: true },
        $or: [
          { term_start_date: { $lt: academic_year_start_date } },
          { term_end_date:   { $gt: academic_year_end_date } },
        ],
      });

      if (outOfRange.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot update session dates. The following subsessions are outside the new date range: ${outOfRange.map((s) => s.term_name).join(", ")}`,
          error: "SUBSESSIONS_OUT_OF_RANGE",
          subsessions_out_of_range: outOfRange.map((s) => ({ term_id: s.term_id, term_name: s.term_name, term_start_date: s.term_start_date, term_end_date: s.term_end_date })),
        });
      }
    }

    if (session_name              !== undefined) session.session_name              = session_name.trim();
    if (session_code              !== undefined) session.session_code              = session_code.trim();
    if (academic_year_start_date  !== undefined) session.academic_year_start_date  = academic_year_start_date;
    if (academic_year_end_date    !== undefined) session.academic_year_end_date    = academic_year_end_date;
    if (session_status            !== undefined) session.session_status            = session_status;
    if (req.body.is_archived      !== undefined) session.is_archived               = req.body.is_archived;
    session.modified_by = modified_by || session.modified_by;
    session.updated_at  = new Date();
    await session.save();

    res.json({ success: true, message: "Session updated successfully", data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update session", error: error.message });
  }
};

// DELETE /session/:sessionId  — cascade delete
exports.deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ session_id: sessionId });
    if (!session) return res.status(404).json({ success: false, message: "Session not found" });

    const results = { session: session.toObject(), subsessions_deleted: 0, headmaster_assignments_deleted: 0, teacher_subject_assignments_deleted: 0, student_class_assignments_deleted: 0, alumni_reverted: 0, admissions_reverted: 0 };

    // 1. Delete subsessions
    const subResult = await Subsession.deleteMany({ session_id: sessionId });
    results.subsessions_deleted = subResult.deletedCount;

    // 2. Delete headmaster assignments
    const hmResult = await ClassHeadmaster.deleteMany({ session_id: sessionId });
    results.headmaster_assignments_deleted = hmResult.deletedCount;

    // 3. Delete teacher-subject assignments
    const tsResult = await TeacherSubjectAssignment.deleteMany({ session_id: sessionId });
    results.teacher_subject_assignments_deleted = tsResult.deletedCount;

    // 4. Delete student class assignments
    const scResult = await StudentClassAssignment.deleteMany({ session_id: sessionId });
    results.student_class_assignments_deleted = scResult.deletedCount;

    // 5. Delete alumni who graduated in this session
    const alumniResult = await Alumni.deleteMany({ graduation_session_id: sessionId });
    results.alumni_reverted = alumniResult.deletedCount;

    // 6. Revert admission graduation status
    const admResult = await Admission.updateMany(
      { graduation_session_id: sessionId, is_graduated: true },
      { $set: { is_graduated: false, graduated_id: null, graduation_session_id: null, graduation_session_name: null, close_date: null, active_status: true, updated_at: new Date() } }
    );
    results.admissions_reverted = admResult.modifiedCount;

    // 7. Delete session
    await Session.deleteOne({ session_id: sessionId });

    res.json({ success: true, message: "Session and all related records deleted successfully", data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete session", error: error.message });
  }
};

// PATCH /session/:sessionId/status
exports.updateSessionStatus = async (req, res) => {
  try {
    const { session_status, modified_by } = req.body;
    if (!["draft","completed","active","archived"].includes(session_status)) {
      return res.status(400).json({ success: false, message: "Valid status is required (draft, completed, active, or archived)" });
    }

    const session = await Session.findOne({ session_id: req.params.sessionId });
    if (!session) return res.status(404).json({ success: false, message: "Session not found" });

    session.session_status = session_status;
    session.is_archived    = session_status === "archived" ? true : session.is_archived;
    session.modified_by    = modified_by || session.modified_by;
    session.updated_at     = new Date();
    await session.save();

    const label = session_status === "active" ? "activated" : session_status === "archived" ? "archived" : session_status === "completed" ? "completed" : "set to draft";
    res.json({ success: true, message: `Session ${label} successfully`, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update session status", error: error.message });
  }
};

// GET /session/school/:schoolId/active
exports.getActiveSessionAndSubsession = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const activeSession = await Session.findOne({
      school_id:                schoolId,
      is_archived:              { $ne: true },
      academic_year_start_date: { $lte: todayStr },
      academic_year_end_date:   { $gte: todayStr },
    }).lean();

    if (!activeSession) {
      return res.json({ success: true, data: { session: null, subsession: null }, message: "No active session found for current date" });
    }

    const activeSubsession = await Subsession.findOne({
      session_id:    activeSession.session_id,
      is_archived:   { $ne: true },
      term_start_date: { $lte: todayStr },
      term_end_date:   { $gte: todayStr },
    }).lean();

    res.json({
      success: true,
      data: { session: activeSession, subsession: activeSubsession || null },
      message: activeSubsession ? "Active session and subsession found" : "Active session found, but no active subsession for current date",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve active session", error: error.message });
  }
};

// POST /session/complete  — create session + subsessions + student promotions
exports.createCompleteSession = async (req, res) => {
  try {
    const { school_id, session_name, session_code, academic_year_start_date, academic_year_end_date,
            session_status, created_by, created_by_name, created_by_role, subsessions, student_promotions } = req.body;

    if (!school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validateSessionData({ session_name, session_code, academic_year_start_date, academic_year_end_date });
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const duplicate = await Session.findOne({ school_id, session_code });
    if (duplicate) return res.status(400).json({ success: false, message: "Session code already exists for this school" });

    // Check date overlap
    const overlap = await Session.findOne({
      school_id,
      is_archived:              { $ne: true },
      academic_year_start_date: { $lt: academic_year_end_date },
      academic_year_end_date:   { $gt: academic_year_start_date },
    });
    if (overlap) {
      return res.status(400).json({
        success: false,
        message: `Session dates overlap with existing session "${overlap.session_name}" (${overlap.session_code})`,
        error: "DATE_OVERLAP",
        conflicting_session: { session_id: overlap.session_id, session_name: overlap.session_name, session_code: overlap.session_code, start_date: overlap.academic_year_start_date, end_date: overlap.academic_year_end_date },
      });
    }

    const newSession = await Session.create({
      session_id:               Date.now().toString(),
      school_id,
      session_name:             session_name.trim(),
      session_code:             session_code.trim(),
      academic_year_start_date,
      academic_year_end_date,
      session_status:           session_status || "draft",
      is_archived:              false,
      created_by:               created_by || null,
      created_by_name:          created_by_name || null,
      created_by_role:          created_by_role || null,
    });

    const { createSubsession } = require("./subsession.controller");
    const { createStudentClassAssignment } = require("./student_class_assignment.controller");
    const { createAlumni } = require("./alumni.controller");
    const { updateAdmission } = require("./admission.controller");

    const results = {
      session: newSession,
      subsessions: { total: 0, successful: 0, failed: 0, errors: [] },
    };

    // Create subsessions
    if (subsessions?.length) {
      results.subsessions.total = subsessions.length;
      for (const sub of subsessions) {
        const result = await createSubsession({
          school_id,
          session_id:               newSession.session_id,
          term_name:                sub.term_name,
          term_code:                sub.term_code,
          term_start_date:          sub.term_start_date,
          term_end_date:            sub.term_end_date,
          term_status:              sub.term_status || "draft",
          grading_template_id:      sub.grading_template_id,
          grading_template_name:    sub.grading_template_name,
          created_by, created_by_name, created_by_role,
        });
        if (result.success) results.subsessions.successful++;
        else { results.subsessions.failed++; results.subsessions.errors.push({ term_name: sub.term_name, error: result.message }); }
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    // Process student promotions/graduations
    if (student_promotions?.length) {
      results.student_promotions = { total: student_promotions.length, promoted: 0, demoted: 0, graduated: 0, failed: 0, errors: [] };

      for (const promotion of student_promotions) {
        try {
          const { student_id, status, next_class_id, current_class_id } = promotion;

          if (status === "graduate") {
            const alumniResult = await createAlumni({
              student_id, school_id,
              graduation_session_id:   newSession.session_id,
              graduation_session_name: newSession.session_name,
              graduation_date:         academic_year_end_date,
              final_class:             current_class_id,
              final_class_name:        promotion.current_class_name || null,
              created_by,
            });

            if (alumniResult.success) {
              const admission = await Admission.findOne({ student_id, school_id, active_status: true });
              if (admission) {
                await updateAdmission(admission.admission_id, {
                  isGraduated: true, graduatedId: alumniResult.data.alumni_id,
                  graduationSessionId: newSession.session_id, graduationSessionName: newSession.session_name,
                  closeDate: academic_year_end_date,
                });
              }
              results.student_promotions.graduated++;
            } else {
              results.student_promotions.failed++;
              results.student_promotions.errors.push({ student_id, error: alumniResult.message });
            }
          } else if (status === "promote" || status === "demote") {
            if (!next_class_id || next_class_id === "null" || next_class_id === "undefined") continue;

            const assignmentResult = await createStudentClassAssignment({
              student_id, school_id,
              class_id:          next_class_id,
              session_id:        newSession.session_id,
              session_name:      newSession.session_name,
              assignment_method: status === "promote" ? "promotion" : "demotion",
              assigned_by:       created_by,
            });

            if (assignmentResult.success) {
              status === "promote" ? results.student_promotions.promoted++ : results.student_promotions.demoted++;
            } else {
              results.student_promotions.failed++;
              results.student_promotions.errors.push({ student_id, error: assignmentResult.message });
            }
          }
          await new Promise((r) => setTimeout(r, 10));
        } catch (err) {
          results.student_promotions.failed++;
          results.student_promotions.errors.push({ student_id: promotion.student_id, error: err.message });
        }
      }
    }

    const hasFailures = results.subsessions.failed > 0 || (results.student_promotions?.failed > 0);
    res.status(201).json({
      success: true,
      message: hasFailures ? "Session created with some failures" : "Session and all related data created successfully",
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create complete session", error: error.message });
  }
};

module.exports = exports;
