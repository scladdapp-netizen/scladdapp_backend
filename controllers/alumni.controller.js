const Alumni = require("../models/Alumni.model");
const Student = require("../models/Student.model");
const Admission = require("../models/Admission.model");
const Session = require("../models/Session.model");

/**
 * Create a new alumni record when a student graduates.
 * If one already exists for the student, update it instead.
 */
const createAlumni = async (alumniData) => {
  try {
    console.log("Creating alumni record with data:", alumniData);

    if (!alumniData.student_id || !alumniData.graduation_session_id) {
      return {
        success: false,
        error: "Missing required fields",
        message: "student_id and graduation_session_id are required",
      };
    }

    const student = await Student.findOne({ student_id: alumniData.student_id }).lean();
    if (!student) {
      return { success: false, error: "Student not found", message: "Student does not exist in the system" };
    }

    // Upsert: update if exists, create if not
    const existing = await Alumni.findOne({ student_id: alumniData.student_id });
    if (existing) {
      console.log(`Alumni record already exists for student ${alumniData.student_id}, updating...`);
      existing.graduation_session_id   = alumniData.graduation_session_id;
      existing.graduation_session_name = alumniData.graduation_session_name || existing.graduation_session_name;
      existing.graduation_date         = alumniData.graduation_date || existing.graduation_date;
      existing.final_class             = alumniData.final_class || existing.final_class;
      existing.final_class_name        = alumniData.final_class_name || existing.final_class_name;
      existing.updated_at              = new Date();
      await existing.save();
      return { success: true, data: { alumni_id: existing.alumni_id, alumni: existing }, message: "Alumni record updated successfully" };
    }

    const newAlumni = await Alumni.create({
      alumni_id: Date.now().toString(),
      student_id: alumniData.student_id,
      school_id: alumniData.school_id,
      graduation_session_id:   alumniData.graduation_session_id,
      graduation_session_name: alumniData.graduation_session_name || null,
      graduation_date:         alumniData.graduation_date || new Date().toISOString().split("T")[0],
      final_class:             alumniData.final_class || null,
      final_class_name:        alumniData.final_class_name || null,
      current_occupation:      alumniData.current_occupation || null,
      current_employer:        alumniData.current_employer || null,
      current_position:        alumniData.current_position || null,
      current_location:        alumniData.current_location || null,
      contact_email:           alumniData.contact_email || student.email || null,
      contact_phone:           alumniData.contact_phone || student.phone || null,
      contact_address:         alumniData.contact_address || student.address || null,
      linkedin_profile:        alumniData.linkedin_profile || null,
      facebook_profile:        alumniData.facebook_profile || null,
      twitter_handle:          alumniData.twitter_handle || null,
      achievements:            alumniData.achievements || null,
      awards:                  alumniData.awards || null,
      remarks:                 alumniData.remarks || null,
      willing_to_mentor:       alumniData.willing_to_mentor || false,
      willing_to_speak:        alumniData.willing_to_speak || false,
      willing_to_donate:       alumniData.willing_to_donate || false,
      created_by:              alumniData.created_by || null,
    });

    console.log("Alumni record created with ID:", newAlumni.alumni_id);
    return { success: true, data: { alumni_id: newAlumni.alumni_id, alumni: newAlumni }, message: "Alumni record created successfully" };
  } catch (error) {
    console.error("Create alumni error:", error);
    return { success: false, error: "Create alumni failed", message: error.message || "Failed to create alumni record" };
  }
};

/**
 * Get alumni by ID (enriched with student info)
 */
const getAlumniById = async (alumniId) => {
  try {
    const alumniRecord = await Alumni.findOne({ alumni_id: alumniId }).lean();
    if (!alumniRecord) {
      return { success: false, error: "Alumni not found", message: "Alumni record not found" };
    }

    const student = await Student.findOne({ student_id: alumniRecord.student_id }).lean();
    return {
      success: true,
      data: {
        ...alumniRecord,
        student_name:     student?.full_name || null,
        gender:           student?.gender || null,
        admission_number: student?.admission_number || null,
      },
      message: "Alumni retrieved successfully",
    };
  } catch (error) {
    console.error("Get alumni error:", error);
    return { success: false, error: "Get alumni failed", message: error.message || "Failed to retrieve alumni" };
  }
};

/**
 * Get alumni by student ID
 */
const getAlumniByStudentId = async (studentId) => {
  try {
    const alumniRecord = await Alumni.findOne({ student_id: studentId }).lean();
    if (!alumniRecord) {
      return { success: false, error: "Alumni not found", message: "No alumni record found for this student" };
    }
    return { success: true, data: alumniRecord, message: "Alumni retrieved successfully" };
  } catch (error) {
    console.error("Get alumni by student error:", error);
    return { success: false, error: "Get alumni failed", message: error.message || "Failed to retrieve alumni" };
  }
};

/**
 * Get alumni by session ID with pagination and search
 */
const getAlumniBySessionId = async (sessionId, params = {}) => {
  try {
    let sessionAlumni = await Alumni.find({ graduation_session_id: sessionId }).lean();

    // Enrich with student info
    const studentIds = sessionAlumni.map((a) => a.student_id);
    const students = await Student.find({ student_id: { $in: studentIds } }).lean();
    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    sessionAlumni = sessionAlumni.map((a) => ({
      ...a,
      student_name:     studentMap[a.student_id]?.full_name || "Unknown",
      admission_number: studentMap[a.student_id]?.admission_number || null,
    }));

    // Search
    const search = (params.search || "").toLowerCase();
    const searchField = params.searchField || "";
    if (search) {
      sessionAlumni = sessionAlumni.filter((a) => {
        if (searchField && searchField !== "all") {
          return String(a[searchField] || "").toLowerCase().includes(search);
        }
        return (
          (a.student_name || "").toLowerCase().includes(search) ||
          (a.admission_number || "").toLowerCase().includes(search) ||
          (a.final_class_name || "").toLowerCase().includes(search) ||
          (a.contact_email || "").toLowerCase().includes(search)
        );
      });
    }

    // Sort
    const sortBy = params.sortBy || "graduation_date";
    const sortOrder = params.sortOrder || "desc";
    sessionAlumni.sort((a, b) => {
      const aVal = a[sortBy] || "";
      const bVal = b[sortBy] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 20;
    const total = sessionAlumni.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      success: true,
      data: sessionAlumni.slice(start, start + limit),
      pagination: { page, limit, total, totalPages },
      message: "Session alumni retrieved successfully",
    };
  } catch (error) {
    console.error("Get alumni by session error:", error);
    return { success: false, data: [], message: error.message || "Failed to retrieve session alumni" };
  }
};

/**
 * Get all alumni for a school (filtered by session start date)
 */
const getAlumniBySchoolId = async (schoolId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allAlumni = await Alumni.find({ school_id: schoolId }).lean();

    // Filter out alumni whose graduation session hasn't started yet
    const sessionIds = [...new Set(allAlumni.map((a) => a.graduation_session_id).filter(Boolean))];
    const sessions = await Session.find({ session_id: { $in: sessionIds } }).lean();
    const sessionMap = {};
    sessions.forEach((s) => { sessionMap[s.session_id] = s; });

    const filtered = allAlumni.filter((a) => {
      if (!a.graduation_session_id) return true;
      const sess = sessionMap[a.graduation_session_id];
      return sess ? new Date(sess.academic_year_start_date) <= today : true;
    });

    // Enrich with student info
    const studentIds = filtered.map((a) => a.student_id);
    const students = await Student.find({ student_id: { $in: studentIds } }).lean();
    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    const data = filtered.map((a) => ({
      ...a,
      student_name:     studentMap[a.student_id]?.full_name || null,
      admission_number: studentMap[a.student_id]?.admission_number || null,
    }));

    return { success: true, data, message: "School alumni retrieved successfully" };
  } catch (error) {
    console.error("Get school alumni error:", error);
    return { success: false, error: "Get school alumni failed", message: error.message || "Failed to retrieve school alumni" };
  }
};

/**
 * Get alumni for a school with pagination and search
 */
const getAlumniBySchoolIdPaginated = async (schoolId, params = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let allAlumni = await Alumni.find({ school_id: schoolId }).lean();

    // Filter by session start date
    const sessionIds = [...new Set(allAlumni.map((a) => a.graduation_session_id).filter(Boolean))];
    const sessions = await Session.find({ session_id: { $in: sessionIds } }).lean();
    const sessionMap = {};
    sessions.forEach((s) => { sessionMap[s.session_id] = s; });

    allAlumni = allAlumni.filter((a) => {
      if (!a.graduation_session_id) return true;
      const sess = sessionMap[a.graduation_session_id];
      return sess ? new Date(sess.academic_year_start_date) <= today : true;
    });

    // Enrich with student info
    const studentIds = allAlumni.map((a) => a.student_id);
    const students = await Student.find({ student_id: { $in: studentIds } }).lean();
    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    let schoolAlumni = allAlumni.map((a) => ({
      ...a,
      student_name:     studentMap[a.student_id]?.full_name || "Unknown",
      admission_number: studentMap[a.student_id]?.admission_number || null,
      gender:           studentMap[a.student_id]?.gender || null,
    }));

    // Year filter
    if (params.year && params.year !== "All") {
      schoolAlumni = schoolAlumni.filter((a) => {
        const year = a.graduation_date ? new Date(a.graduation_date).getFullYear().toString() : null;
        return year === params.year;
      });
    }

    // Search
    const search = (params.search || "").toLowerCase();
    if (search) {
      schoolAlumni = schoolAlumni.filter(
        (a) =>
          (a.student_name || "").toLowerCase().includes(search) ||
          (a.final_class_name || "").toLowerCase().includes(search) ||
          (a.contact_email || "").toLowerCase().includes(search)
      );
    }

    // Sort newest first
    schoolAlumni.sort((a, b) => new Date(b.graduation_date) - new Date(a.graduation_date));

    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 15;
    const totalRecords = schoolAlumni.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const startIndex = (page - 1) * limit;

    return {
      success: true,
      data: schoolAlumni.slice(startIndex, startIndex + limit),
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + limit, totalRecords),
      },
    };
  } catch (error) {
    return { success: false, data: [], message: error.message };
  }
};

/**
 * Update alumni record
 */
const updateAlumni = async (alumniId, alumniData) => {
  try {
    console.log("Updating alumni with ID:", alumniId);

    const alumni = await Alumni.findOne({ alumni_id: alumniId });
    if (!alumni) {
      return { success: false, error: "Alumni not found", message: "Alumni record not found" };
    }

    const fields = [
      "current_occupation", "current_employer", "current_position", "current_location",
      "contact_email", "contact_phone", "contact_address",
      "linkedin_profile", "facebook_profile", "twitter_handle",
      "achievements", "awards", "remarks",
      "willing_to_mentor", "willing_to_speak", "willing_to_donate",
    ];

    fields.forEach((f) => {
      if (alumniData[f] !== undefined) alumni[f] = alumniData[f];
    });

    alumni.updated_at = new Date();
    await alumni.save();

    console.log("Alumni updated with ID:", alumniId);
    return { success: true, data: { alumni_id: alumniId, alumni }, message: "Alumni updated successfully" };
  } catch (error) {
    console.error("Update alumni error:", error);
    return { success: false, error: "Update alumni failed", message: error.message || "Failed to update alumni" };
  }
};

/**
 * Delete alumni record (hard delete)
 */
const deleteAlumni = async (alumniId) => {
  try {
    const alumni = await Alumni.findOneAndDelete({ alumni_id: alumniId });
    if (!alumni) {
      return { success: false, error: "Alumni not found", message: "Alumni record not found" };
    }
    console.log("Alumni deleted with ID:", alumniId);
    return { success: true, message: "Alumni deleted successfully" };
  } catch (error) {
    console.error("Delete alumni error:", error);
    return { success: false, error: "Delete alumni failed", message: error.message || "Failed to delete alumni" };
  }
};

module.exports = {
  createAlumni,
  getAlumniById,
  getAlumniByStudentId,
  getAlumniBySchoolId,
  getAlumniBySchoolIdPaginated,
  getAlumniBySessionId,
  updateAlumni,
  deleteAlumni,
};
