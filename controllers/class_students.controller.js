const crypto = require("crypto");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Subsession = require("../models/Subsession.model");
const Session = require("../models/Session.model");
const Class = require("../models/Class.model");
const Student = require("../models/Student.model");
const StudentGuardian = require("../models/StudentGuardian.model");

const classTitle = (row) => [row?.class_name, row?.class_section].filter(Boolean).join(" ") || "Class";

const loadTerm = async (classId, subsessionId) => {
  const subsession = await Subsession.findOne({ term_id: String(subsessionId) }).lean();
  if (!subsession) return { error: { status: 404, message: "Term not found" } };
  const classInfo = await Class.findOne({ class_id: String(classId) }).lean();
  if (!classInfo) return { error: { status: 404, message: "Class not found" } };
  const session = await Session.findOne({ session_id: String(subsession.session_id) }).lean();
  return { subsession, classInfo, session };
};

/**
 * GET /api/class-students/:classId/subsession/:subsessionId
 * Returns all active students assigned to a class for the session
 * that owns the given subsession. Supports pagination + search.
 */
const getStudentsByClassAndSubsession = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "" } = req.query;

    if (!classId || !subsessionId) {
      return res.status(400).json({ success: false, message: "classId and subsessionId are required" });
    }

    const subsession = await Subsession.findOne({ term_id: subsessionId }).lean();
    if (!subsession) return res.status(404).json({ success: false, message: "Subsession not found" });

    const assignments = await StudentClassAssignment.find({
      class_id:   classId,
      session_id: subsession.session_id,
      is_active:  true,
    }).lean();

    const studentIds = assignments.map((a) => a.student_id);

    const [students, guardians] = await Promise.all([
      Student.find({ student_id: { $in: studentIds } }).lean(),
      StudentGuardian.find({ student_id: { $in: studentIds } }).lean(),
    ]);

    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    // Build primary guardian map
    const guardianMap = {};
    guardians.forEach((g) => {
      if (!guardianMap[g.student_id] || g.is_primary) {
        guardianMap[g.student_id] = g;
      }
    });

    let rows = assignments.map((a) => {
      const s = studentMap[a.student_id] || {};
      const g = guardianMap[a.student_id] || {};
      return {
        assignment_id:     a.assignment_id,
        student_id:        a.student_id,
        full_name:         s.full_name         || "Unknown",
        admission_number:  s.admission_number  || "—",
        gender:            s.gender            || "—",
        date_of_birth:     s.date_of_birth     || null,
        phone:             s.phone             || "—",
        address:           s.address           || "—",
        student_status:    s.student_status    || "active",
        student_photo:     s.student_photo     || null,
        assignment_method: a.assignment_method || "—",
        assignment_date:   a.assignment_date   || null,
        guardian_name:     g.guardian_name     || "—",
        guardian_phone:    g.guardian_phone    || "—",
      };
    });

    // Search
    if (search && search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        if (searchField && r[searchField] !== undefined) return r[searchField].toString().toLowerCase().includes(q);
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.admission_number.toLowerCase().includes(q) ||
          r.gender.toLowerCase().includes(q) ||
          r.guardian_name.toLowerCase().includes(q)
        );
      });
    }

    const pageNum    = parseInt(page);
    const limitNum   = parseInt(limit);
    const total      = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex   = Math.min(startIndex + limitNum, total);

    return res.json({
      success: true,
      data: rows.slice(startIndex, endIndex),
      pagination: {
        currentPage:   pageNum,
        totalPages,
        totalRecords:  total,
        recordsPerPage: limitNum,
        hasNextPage:   pageNum < totalPages,
        hasPrevPage:   pageNum > 1,
        startIndex:    total === 0 ? 0 : startIndex + 1,
        endIndex,
      },
    });
  } catch (error) {
    console.error("getStudentsByClassAndSubsession error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch class students" });
  }
};

const getCandidateStudents = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const { page = 1, limit = 30, search = "" } = req.query;
    const term = await loadTerm(classId, subsessionId);
    if (term.error) return res.status(term.error.status).json({ success: false, message: term.error.message });

    const assignments = await StudentClassAssignment.find({
      session_id: term.subsession.session_id,
      is_active: true,
    }).lean();
    const here = new Set(
      assignments.filter((row) => String(row.class_id) === String(classId)).map((row) => String(row.student_id))
    );
    const currentClass = {};
    assignments.forEach((row) => {
      if (!here.has(String(row.student_id))) currentClass[String(row.student_id)] = row.class_name || "Another class";
    });

    const query = {
      school_id: String(term.subsession.school_id),
      student_id: { $nin: [...here] },
    };
    const q = String(search || "").trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { full_name: { $regex: safe, $options: "i" } },
        { admission_number: { $regex: safe, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 30));
    const [total, students] = await Promise.all([
      Student.countDocuments(query),
      Student.find(query)
        .select("student_id full_name admission_number gender student_status")
        .sort({ full_name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: students.map((student) => ({
        student_id: student.student_id,
        full_name: student.full_name || "Student",
        admission_number: student.admission_number || "",
        gender: student.gender || "",
        student_status: student.student_status || "active",
        current_class: currentClass[String(student.student_id)] || "",
      })),
      pagination: {
        currentPage: pageNum,
        totalRecords: total,
        hasNextPage: pageNum * limitNum < total,
      },
    });
  } catch (error) {
    console.error("getCandidateStudents error:", error);
    return res.status(500).json({ success: false, message: "Failed to load students" });
  }
};

const addStudentsToClass = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const ids = [...new Set((req.body.student_ids || []).map(String).filter(Boolean))].slice(0, 200);
    if (!ids.length) return res.status(400).json({ success: false, message: "Choose at least one student" });

    const term = await loadTerm(classId, subsessionId);
    if (term.error) return res.status(term.error.status).json({ success: false, message: term.error.message });

    const title = classTitle(term.classInfo);
    let added = 0;
    let moved = 0;
    const skipped = [];

    for (const studentId of ids) {
      const student = await Student.findOne({
        student_id: studentId,
        school_id: String(term.subsession.school_id),
      }).lean();
      if (!student) {
        skipped.push(studentId);
        continue;
      }

      const existing = await StudentClassAssignment.findOne({
        student_id: studentId,
        session_id: term.subsession.session_id,
        is_active: true,
      });

      if (existing && String(existing.class_id) === String(classId)) continue;

      if (existing) {
        existing.is_active = false;
        existing.updated_at = new Date();
        await existing.save();
        moved += 1;
      } else {
        added += 1;
      }

      await StudentClassAssignment.create({
        assignment_id: `asg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        student_id: studentId,
        school_id: String(term.subsession.school_id),
        class_id: String(classId),
        class_name: title,
        stream: term.classInfo.stream || null,
        session_id: term.subsession.session_id,
        session_name: term.session?.session_name || null,
        subsession_id: term.subsession.term_id,
        subsession_name: term.subsession.term_name || null,
        assignment_method: existing ? "transfer" : "admission",
        assignment_date: new Date().toISOString().split("T")[0],
        is_active: true,
        assigned_by: req.body.assigned_by || null,
        remarks: existing ? `Moved from ${existing.class_name || "another class"}` : "Added to class",
      });
    }

    return res.json({
      success: true,
      message: moved
        ? `${added + moved} student${added + moved === 1 ? "" : "s"} added. ${moved} moved from another class in this session.`
        : `${added} student${added === 1 ? "" : "s"} added.`,
      added,
      moved,
      skipped: skipped.length,
    });
  } catch (error) {
    console.error("addStudentsToClass error:", error);
    return res.status(500).json({ success: false, message: "Failed to add students" });
  }
};

module.exports = { getStudentsByClassAndSubsession, getCandidateStudents, addStudentsToClass };
