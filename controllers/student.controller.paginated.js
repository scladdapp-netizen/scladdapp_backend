const Student = require("../models/Student.model");
const Admission = require("../models/Admission.model");
const Alumni = require("../models/Alumni.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const StudentGuardian = require("../models/StudentGuardian.model");
const Session = require("../models/Session.model");

const getStudentsBySchoolIdPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "admitted_date", sortOrder = "desc" } = req.query;

    // Get all admissions for this school
    const schoolAdmissions = await Admission.find({ school_id: schoolId }).lean();
    const admittedStudentIds = schoolAdmissions.map((a) => a.student_id);

    // Determine target session (current active or most recent completed)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const schoolSessions = await Session.find({ school_id: schoolId, is_archived: { $ne: true } }).lean();

    let targetSession = schoolSessions.find((s) => {
      const start = new Date(s.academic_year_start_date); start.setHours(0, 0, 0, 0);
      const end   = new Date(s.academic_year_end_date);   end.setHours(0, 0, 0, 0);
      return today >= start && today <= end;
    });

    if (!targetSession) {
      const completed = schoolSessions
        .filter((s) => { const end = new Date(s.academic_year_end_date); end.setHours(0,0,0,0); return end < today; })
        .sort((a, b) => new Date(b.academic_year_end_date) - new Date(a.academic_year_end_date));
      targetSession = completed[0] || null;
    }

    const currentSessionExists = schoolSessions.some((s) => {
      const start = new Date(s.academic_year_start_date); start.setHours(0,0,0,0);
      const end   = new Date(s.academic_year_end_date);   end.setHours(0,0,0,0);
      return today >= start && today <= end;
    });

    // Build set of graduated student IDs (only if graduation session has started)
    const schoolAlumni = await Alumni.find({ school_id: schoolId }).lean();
    const graduatedIds = new Set();
    const gradSessionIds = [...new Set(schoolAlumni.map((a) => a.graduation_session_id).filter(Boolean))];
    const gradSessions = await Session.find({ session_id: { $in: gradSessionIds } }).lean();
    const gradSessionMap = {};
    gradSessions.forEach((s) => { gradSessionMap[s.session_id] = s; });

    schoolAlumni.forEach((a) => {
      const gradSession = gradSessionMap[a.graduation_session_id];
      if (gradSession) {
        const sessionStart = new Date(gradSession.academic_year_start_date); sessionStart.setHours(0,0,0,0);
        if (today >= sessionStart) graduatedIds.add(a.student_id);
      } else {
        graduatedIds.add(a.student_id);
      }
    });

    // Batch-load students, guardians, class assignments
    const [students, guardians, classAssignments] = await Promise.all([
      Student.find({ student_id: { $in: admittedStudentIds } }).lean(),
      StudentGuardian.find({ student_id: { $in: admittedStudentIds } }).lean(),
      targetSession
        ? StudentClassAssignment.find({ session_id: targetSession.session_id, student_id: { $in: admittedStudentIds }, is_active: true }).lean()
        : Promise.resolve([]),
    ]);

    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    // Primary guardian map
    const guardianMap = {};
    guardians.forEach((g) => {
      if (!guardianMap[g.student_id] || g.is_primary) guardianMap[g.student_id] = g;
    });

    // Class assignment map for target session
    const assignmentMap = {};
    classAssignments.forEach((a) => { assignmentMap[a.student_id] = a; });

    // For students without a target-session assignment but current session exists, find most recent past assignment
    const missingIds = admittedStudentIds.filter((id) => !assignmentMap[id] && currentSessionExists && !graduatedIds.has(id));
    let pastAssignments = [];
    if (missingIds.length > 0) {
      pastAssignments = await StudentClassAssignment.find({ student_id: { $in: missingIds }, is_active: true }).lean();
    }
    const pastAssignmentMap = {};
    pastAssignments.forEach((a) => {
      const sess = schoolSessions.find((s) => s.session_id === a.session_id);
      if (!sess) return;
      const end = new Date(sess.academic_year_end_date); end.setHours(0,0,0,0);
      if (end >= today) return; // not past
      const existing = pastAssignmentMap[a.student_id];
      if (!existing || new Date(sess.academic_year_end_date) > new Date((schoolSessions.find((s) => s.session_id === existing.session_id) || {}).academic_year_end_date || 0)) {
        pastAssignmentMap[a.student_id] = a;
      }
    });

    // Build rows
    let rows = schoolAdmissions
      .map((admission) => {
        const student = studentMap[admission.student_id];
        if (!student) return null;
        if (graduatedIds.has(student.student_id)) return null;

        const g = guardianMap[student.student_id] || {};
        let activeAssignment = assignmentMap[student.student_id] || null;
        let isFromPastSession = false;

        if (!activeAssignment && currentSessionExists) {
          activeAssignment = pastAssignmentMap[student.student_id] || null;
          if (activeAssignment) isFromPastSession = true;
        }

        return {
          student_id:          student.student_id,
          full_name:           student.full_name,
          email:               student.email,
          phone:               student.phone,
          date_of_birth:       student.date_of_birth,
          gender:              student.gender,
          student_photo:       student.student_photo,
          admission_id:        admission.admission_id,
          admitted_date:       admission.admitted_date,
          close_date:          admission.close_date,
          admission_class:     admission.admission_class,
          admission_session:   admission.admission_session,
          admission_term:      admission.admission_term,
          active_status:       admission.active_status,
          admission_type:      admission.admission_type,
          guardian_name:       g.guardian_name || student.guardian_name || null,
          guardian_phone:      g.guardian_phone || student.guardian_phone || null,
          guardian_relationship: g.guardian_relationship || student.guardian_relationship || null,
          current_class_id:    activeAssignment?.class_id || null,
          current_class_name:  activeAssignment?.class_name || null,
          current_class_stream: activeAssignment?.stream || null,
          class_assignment_method: activeAssignment?.assignment_method || null,
          class_assignment_session: activeAssignment?.session_name || null,
          class_assignment_session_id: activeAssignment?.session_id || null,
          is_class_from_past_session: isFromPastSession,
          current_session_exists: currentSessionExists,
          status:              admission.active_status ? "Active" : "Inactive",
          religion:            student.religion,
          nationality:         student.nationality,
          blood_group:         student.blood_group,
          genotype:            student.genotype,
          emergency_contact_name:  student.emergency_contact_name,
          emergency_contact_phone: student.emergency_contact_phone,
        };
      })
      .filter(Boolean);

    // Search
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter((s) => {
        if (searchField && searchField.trim()) {
          const v = s[searchField];
          return v && String(v).toLowerCase().includes(q);
        }
        return Object.values(s).some((v) => v && String(v).toLowerCase().includes(q));
      });
    }

    // Sort
    rows.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === "admitted_date" || sortBy === "date_of_birth") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else {
        aVal = aVal || ""; bVal = bVal || "";
      }
      return sortOrder === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    const totalRecords   = rows.length;
    const currentPage    = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const totalPages     = Math.ceil(totalRecords / recordsPerPage);
    const startIndex     = (currentPage - 1) * recordsPerPage;

    return res.json({
      success: true,
      data: rows.slice(startIndex, startIndex + recordsPerPage),
      pagination: {
        currentPage, totalPages, totalRecords, recordsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + recordsPerPage, totalRecords),
      },
    });
  } catch (error) {
    console.error("Get paginated students error:", error);
    return res.status(500).json({ success: false, error: "Get students failed", message: error.message || "Failed to retrieve students" });
  }
};

module.exports = { getStudentsBySchoolIdPaginated };
